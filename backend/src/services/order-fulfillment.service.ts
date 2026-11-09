/**
 * Courier dispatch and tracking.
 *
 * Dispatch holds a row lock on the order (`SELECT ... FOR UPDATE`) while the
 * courier books the parcel, so two concurrent dispatches of the same order can
 * never book two parcels: the second waits, then sees the tracking ID → 409.
 * If anything fails AFTER the courier booked the parcel (validation of the
 * provider response, the UPDATE, the COMMIT), the booking is compensated by
 * cancelling the parcel and the outcome is logged; a courier that cannot
 * cancel (Steadfast) is logged as requiring manual action.
 */
import { eq } from "drizzle-orm";
import { db, type DatabaseClient } from "../db/client";
import { orders, orderStatusHistory } from "../db/schema/tables";
import { AppError, ErrorCode } from "../lib/errors";
import { hasPermission, Permissions } from "../lib/rbac";
import type {
  CourierProvider,
  NormalizedCourierStatus,
  ParcelBooking,
  ParcelCancellation,
} from "./courier/courier.interface";
import { courierService, type CourierService } from "./courier/courier.service";
import {
  formatShippingAddress,
  readShippingAddress,
  type OrderDetailDTO,
  type OrderStatusHistoryEntryDTO,
} from "./order-dto";
import { publishOrderStatusEvent } from "./order-events";
import { moneyToNumber } from "./order-pricing";
import type { OrderStatus } from "./order-state-machine";
import { orderService, type OrderViewer } from "./order.service";

export interface DispatchRequest {
  weightKg?: number;
  note?: string;
}

export interface ParcelDTO {
  provider: string;
  trackingId: string;
  consignmentId: string | null;
  rawStatus: string | null;
  normalizedStatus: NormalizedCourierStatus;
  labelUrl: string | null;
}

export interface DispatchResultDTO {
  order: OrderDetailDTO;
  parcel: ParcelDTO;
}

export interface CourierStatusDTO {
  provider: string;
  trackingId: string;
  rawStatus: string;
  normalizedStatus: NormalizedCourierStatus;
  checkedAt: string;
}

export interface OrderTrackingDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  courierProvider: string | null;
  trackingId: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  history: OrderStatusHistoryEntryDTO[];
  /** Live status from the courier; null before dispatch or when the courier is unreachable. */
  courier: CourierStatusDTO | null;
  /** Why `courier` is null after dispatch (provider unreachable / not integrated). */
  courierError: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OrderFulfillmentService {
  constructor(
    private readonly courier: CourierService = courierService,
    private readonly database: DatabaseClient = db,
  ) {}

  /** POST /admin/orders/:id/dispatch-courier — PROCESSING → SHIPPED via the default courier. */
  async dispatch(orderId: string, request: DispatchRequest, actor: OrderViewer): Promise<DispatchResultDTO> {
    const provider = this.courier.getDefault(); // 503 before taking any lock when unconfigured
    const state: { booking: ParcelBooking | null } = { booking: null };

    try {
      await this.database.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
        if (!order) throw AppError.notFound("Order");
        if (order.trackingId) {
          throw AppError.conflict("This order has already been dispatched", {
            trackingId: order.trackingId,
            courierProvider: order.courierProvider,
          });
        }
        if (order.status !== "PROCESSING") {
          throw AppError.invalidStatusTransition(
            order.status,
            "SHIPPED",
            `Only PROCESSING orders can be dispatched (current status: ${order.status})`,
          );
        }

        const address = readShippingAddress(order.shippingAddress);
        const codAmount =
          order.paymentMethod === "COD" && order.paymentStatus === "UNPAID" ? moneyToNumber(order.total) : 0;

        const booking = await provider.createParcel({
          orderNumber: order.orderNumber,
          recipientName: address.fullName,
          recipientPhone: address.phone,
          recipientAddress: formatShippingAddress(address),
          codAmount,
          note: request.note,
          weightKg: request.weightKg,
        });
        state.booking = booking;

        if (booking.trackingId.trim().length === 0) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, "The courier returned an empty tracking ID", {
            httpStatus: 502,
          });
        }

        await tx
          .update(orders)
          .set({
            status: "SHIPPED",
            trackingId: booking.trackingId,
            courierProvider: provider.name,
            shippedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "SHIPPED",
          changedBy: actor.id,
          note: [`Dispatched via ${provider.name} (tracking ${booking.trackingId})`, request.note]
            .filter((part): part is string => typeof part === "string" && part.length > 0)
            .join(" — "),
        });
      });
    } catch (error) {
      const booking = state.booking;
      if (booking === null) throw error;

      const compensation = await this.compensate(provider, orderId, booking, error);
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        "The parcel was booked but the order could not be updated",
        {
          details: {
            trackingId: booking.trackingId,
            compensation: compensation.status,
            compensationMessage: compensation.message,
          },
          cause: error,
        },
      );
    }

    const booking = state.booking;
    if (booking === null) {
      throw AppError.internal("Courier booking result is missing");
    }

    publishOrderStatusEvent(orderId, "SHIPPED");
    const order = await orderService.getOrderDetail(orderId, actor);
    return {
      order,
      parcel: {
        provider: booking.provider,
        trackingId: booking.trackingId,
        consignmentId: booking.consignmentId,
        rawStatus: booking.rawStatus,
        normalizedStatus: booking.normalizedStatus,
        labelUrl: booking.labelUrl,
      },
    };
  }

  /** Timeline + live courier status for the owner or ORDERS_READ staff. */
  async getTracking(idOrNumber: string, viewer: OrderViewer): Promise<OrderTrackingDTO> {
    const order = await orderService.getOrderForViewer(idOrNumber, viewer);

    let courierStatus: CourierStatusDTO | null = null;
    let courierError: string | null = null;
    if (order.trackingId) {
      try {
        const tracking = await this.courier.trackParcel(order.courierProvider, order.trackingId);
        courierStatus = {
          provider: tracking.provider,
          trackingId: tracking.trackingId,
          rawStatus: tracking.rawStatus,
          normalizedStatus: tracking.normalizedStatus,
          checkedAt: tracking.checkedAt.toISOString(),
        };
      } catch (error) {
        // Staff get the actionable reason (e.g. missing courier credentials);
        // customers get a neutral message that never exposes configuration.
        const isStaffViewer = hasPermission(viewer.role, Permissions.ORDERS_READ);
        courierError =
          isStaffViewer && error instanceof AppError
            ? error.message
            : "Live courier status is temporarily unavailable. Please try again later.";
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "courier_tracking_failed",
            orderId: order.id,
            provider: order.courierProvider,
            trackingId: order.trackingId,
            message: errorMessage(error),
          }),
        );
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      courierProvider: order.courierProvider,
      trackingId: order.trackingId,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      history: order.statusHistory,
      courier: courierStatus,
      courierError,
    };
  }

  private async compensate(
    provider: CourierProvider,
    orderId: string,
    booking: ParcelBooking,
    cause: unknown,
  ): Promise<ParcelCancellation> {
    let outcome: ParcelCancellation;
    try {
      outcome = await provider.cancelParcel(booking.trackingId);
    } catch (error) {
      outcome = {
        provider: provider.name,
        trackingId: booking.trackingId,
        status: "FAILED",
        message: errorMessage(error),
      };
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "courier_dispatch_compensation",
        orderId,
        provider: provider.name,
        trackingId: booking.trackingId,
        compensation: outcome.status,
        message: outcome.message,
        cause: errorMessage(cause),
        actionRequired:
          outcome.status === "CANCELLED" ? null : "Cancel this consignment manually in the courier portal",
      }),
    );
    return outcome;
  }
}

export const orderFulfillmentService = new OrderFulfillmentService();
