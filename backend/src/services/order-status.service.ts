/**
 * Order status transitions (staff PATCH and customer self-cancel).
 *
 * Every transition runs in ONE transaction that row-locks the order
 * (`SELECT ... FOR UPDATE`), re-validates the transition against the state
 * machine, applies side effects and appends an order_status_history row:
 *  - SHIPPED   → shipped_at (+ optional manual tracking info)
 *  - DELIVERED → delivered_at; a COD order that was UNPAID becomes PAID
 *  - CANCELLED → cancelled_at; stock reservation released (inventory
 *                service, same transaction); coupon usage given back
 *  - REFUNDED  → payment_status REFUNDED (requires REFUNDS_APPROVE)
 * Two concurrent cancellations serialise on the row lock: the second sees
 * CANCELLED and fails with 409, so stock and coupon usage are restored once.
 *
 * Cancelling a SHIPPED order first asks the courier to cancel the parcel. When
 * the courier cannot confirm it (e.g. Steadfast has no cancel API) the request
 * is rejected with 409 unless staff confirm they cancelled it manually
 * (`courierCancellationConfirmed: true`).
 */
import { eq, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { orders, orderStatusHistory } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import { hasPermission, Permissions } from "../lib/rbac";
import { invalidateCatalogCache } from "../middleware/cache";
import { couponService } from "./coupon.service";
import { courierService, type CourierService } from "./courier/courier.service";
import { inventoryService } from "./inventory.service";
import type { OrderDetailDTO } from "./order-dto";
import { publishOrderStatusEvent, requestInvoice } from "./order-events";
import { assertTransition, CUSTOMER_CANCELLABLE_STATUSES, type OrderStatus } from "./order-state-machine";
import { orderLookupCondition, orderService, type OrderViewer } from "./order.service";

export interface StatusChangeRequest {
  status: OrderStatus;
  /** Shown in the order timeline (visible to the customer). */
  note?: string;
  /** Staff confirm the parcel was cancelled outside the courier API. */
  courierCancellationConfirmed?: boolean;
  /** Manual shipment details (only with status SHIPPED). */
  courierProvider?: string;
  trackingId?: string;
}

interface TransitionParams {
  where: SQL;
  to: OrderStatus;
  actor: OrderViewer;
  note: string | null;
  /** Restricts the current status (customer self-cancel). */
  allowedFrom?: readonly OrderStatus[];
  /** Restricts the order to this owner (customer self-cancel). */
  ownerId?: string;
  shipment?: { courierProvider: string; trackingId: string };
}

interface TransitionResult {
  orderId: string;
  from: OrderStatus;
  paymentStatusChanged: boolean;
}

function joinNotes(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" — ");
  return text.length > 0 ? text : null;
}

export class OrderStatusService {
  constructor(private readonly courier: CourierService = courierService) {}

  /** PATCH /admin/orders/:id/status */
  async changeStatus(orderId: string, request: StatusChangeRequest, actor: OrderViewer): Promise<OrderDetailDTO> {
    if (request.status === "REFUNDED" && !hasPermission(actor.role, Permissions.REFUNDS_APPROVE)) {
      throw AppError.forbidden(`Missing required permission [${Permissions.REFUNDS_APPROVE}]`, {
        permission: Permissions.REFUNDS_APPROVE,
      });
    }

    const [current] = await db
      .select({ status: orders.status, trackingId: orders.trackingId, courierProvider: orders.courierProvider })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!current) throw AppError.notFound("Order");
    assertTransition(current.status, request.status);

    let courierNote: string | null = null;
    if (request.status === "CANCELLED" && current.status === "SHIPPED" && current.trackingId) {
      const outcome = await this.courier.cancelParcel(current.courierProvider, current.trackingId);
      console.log(
        JSON.stringify({
          level: outcome.status === "CANCELLED" ? "info" : "warn",
          event: "courier_cancel_attempt",
          orderId,
          provider: outcome.provider,
          trackingId: outcome.trackingId,
          status: outcome.status,
          message: outcome.message,
        }),
      );
      if (outcome.status !== "CANCELLED" && request.courierCancellationConfirmed !== true) {
        throw AppError.conflict(
          "The courier did not confirm the parcel cancellation. Cancel the parcel with the courier, then retry with courierCancellationConfirmed set to true.",
          { courierCancellation: outcome },
        );
      }
      courierNote =
        outcome.status === "CANCELLED"
          ? `Courier parcel ${current.trackingId} cancelled`
          : `Courier cancellation ${outcome.status.toLowerCase().replace("_", " ")}; confirmed manually by staff`;
    }

    const shipment =
      request.status === "SHIPPED" && request.trackingId && request.courierProvider
        ? { trackingId: request.trackingId, courierProvider: request.courierProvider.toLowerCase() }
        : undefined;

    const result = await this.transition({
      where: eq(orders.id, orderId),
      to: request.status,
      actor,
      note: joinNotes(request.note, courierNote),
      shipment,
    });
    this.afterCommit(result, request.status);
    return orderService.getOrderDetail(result.orderId, actor);
  }

  /** POST /orders/:id/cancel — the owner may cancel while the order is PENDING. */
  async cancelByCustomer(idOrNumber: string, actor: OrderViewer, reason?: string): Promise<OrderDetailDTO> {
    const result = await this.transition({
      where: orderLookupCondition(idOrNumber),
      to: "CANCELLED",
      actor,
      note: joinNotes("Cancelled by customer", reason),
      allowedFrom: CUSTOMER_CANCELLABLE_STATUSES,
      ownerId: actor.id,
    });
    this.afterCommit(result, "CANCELLED");
    return orderService.getOrderDetail(result.orderId, actor);
  }

  private async transition(params: TransitionParams): Promise<TransitionResult> {
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: orders.id,
          userId: orders.userId,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          discountId: orders.discountId,
        })
        .from(orders)
        .where(params.where)
        .limit(1)
        .for("update");
      if (!order) throw AppError.notFound("Order");
      if (params.ownerId !== undefined && order.userId !== params.ownerId) {
        throw AppError.forbidden("You do not have access to this order");
      }
      if (params.allowedFrom !== undefined && !params.allowedFrom.includes(order.status)) {
        throw AppError.invalidStatusTransition(
          order.status,
          params.to,
          order.status === params.to
            ? `Order is already ${params.to}`
            : `Orders can only be cancelled while ${params.allowedFrom.join(" or ")}. Please contact support.`,
        );
      }
      assertTransition(order.status, params.to);

      const now = new Date();
      const patch: Partial<typeof orders.$inferInsert> = { status: params.to };
      let paymentStatusChanged = false;

      switch (params.to) {
        case "SHIPPED":
          patch.shippedAt = now;
          if (params.shipment) {
            patch.trackingId = params.shipment.trackingId;
            patch.courierProvider = params.shipment.courierProvider;
          }
          break;
        case "DELIVERED":
          patch.deliveredAt = now;
          if (order.paymentMethod === "COD" && order.paymentStatus === "UNPAID") {
            patch.paymentStatus = "PAID";
            paymentStatusChanged = true;
          }
          break;
        case "CANCELLED":
          patch.cancelledAt = now;
          await inventoryService.releaseReservation(order.id, params.actor.id, tx);
          if (order.discountId !== null) {
            await couponService.releaseRedemption(order.discountId, tx);
          }
          break;
        case "REFUNDED":
          if (order.paymentStatus !== "REFUNDED") {
            patch.paymentStatus = "REFUNDED";
            paymentStatusChanged = true;
          }
          break;
        case "PENDING":
        case "PROCESSING":
          break;
      }

      await tx.update(orders).set(patch).where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: params.to,
        changedBy: params.actor.id,
        note: params.note,
      });

      return { orderId: order.id, from: order.status, paymentStatusChanged };
    });
  }

  private afterCommit(result: TransitionResult, to: OrderStatus): void {
    if (to === "CANCELLED") {
      invalidateCatalogCache();
    }
    publishOrderStatusEvent(result.orderId, to);
    if (result.paymentStatusChanged) {
      requestInvoice(result.orderId, `payment-${to.toLowerCase()}`);
    }
  }
}

export const orderStatusService = new OrderStatusService();
