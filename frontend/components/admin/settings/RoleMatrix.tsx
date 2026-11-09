"use client";

import { Fragment } from "react";
import { Badge, Box, Skeleton, Stack, Table, Text, VisuallyHidden } from "@mantine/core";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import type { AdminRoleSummary } from "../../../types/admin-management";
import { formatCount, pluralize, roleLabel } from "../format";
import { PERMISSION_GROUPS, ROLE_COLORS, permissionLabel } from "./role-meta";
import classes from "./settings.module.css";

export interface RoleMatrixProps {
  roles: readonly AdminRoleSummary[] | undefined;
  loading: boolean;
}

const SKELETON_COLUMNS = 5;

/**
 * Role × permission matrix from `GET /admin/roles` (the server's RBAC table,
 * not a frontend copy). Customers are summarised below — they have no
 * back-office permissions.
 */
export function RoleMatrix({ roles, loading }: RoleMatrixProps) {
  const staffRoles = (roles ?? []).filter((role) => role.role !== "CUSTOMER");
  const customers = roles?.find((role) => role.role === "CUSTOMER");
  const columnCount = roles ? staffRoles.length : SKELETON_COLUMNS;

  return (
    <Stack gap="sm">
      <Box className={classes.matrixFrame}>
        <Table.ScrollContainer minWidth={760} type="native">
          <Table className={classes.matrix} verticalSpacing={8} horizontalSpacing="sm" aria-label="Permissions by role" aria-busy={loading && !roles}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col" w="34%">
                  <Text span size="xs" fw={600} c="var(--mo-color-text-secondary)">
                    Permission
                  </Text>
                </Table.Th>
                {loading && !roles
                  ? Array.from({ length: SKELETON_COLUMNS }, (_, index) => (
                      <Table.Th key={index} ta="center">
                        <Skeleton height={20} width={96} radius="xl" mx="auto" />
                        <Skeleton height={10} width={50} radius="xl" mx="auto" mt={6} />
                      </Table.Th>
                    ))
                  : staffRoles.map((role) => (
                      <Table.Th key={role.role} scope="col" ta="center">
                        <Badge color={ROLE_COLORS[role.role]} variant="light" radius="xl" tt="none" fw={600} style={{ maxWidth: "none" }}>
                          {roleLabel(role.role)}
                        </Badge>
                        <Text size="xs" c="var(--mo-color-text-muted)" mt={4} className="mo-tabular-nums">
                          {pluralize(role.userCount, "account")}
                        </Text>
                      </Table.Th>
                    ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <Table.Tr className={classes.groupRow}>
                    <Table.Th scope="colgroup" colSpan={columnCount + 1}>
                      <Text span size="xs" fw={700} tt="uppercase" c="var(--mo-color-text-muted)" style={{ letterSpacing: "0.04em" }}>
                        {group.label}
                      </Text>
                    </Table.Th>
                  </Table.Tr>
                  {group.permissions.map((permission) => (
                    <Table.Tr key={permission}>
                      <Table.Th scope="row" fw={400}>
                        <Text size="sm" c="var(--mo-color-text-strong)">
                          {permissionLabel(permission)}
                        </Text>
                      </Table.Th>
                      {loading && !roles
                        ? Array.from({ length: SKELETON_COLUMNS }, (_, index) => (
                            <Table.Td key={index} ta="center">
                              <Skeleton circle height={22} mx="auto" />
                            </Table.Td>
                          ))
                        : staffRoles.map((role) => {
                            const allowed = role.permissions.includes(permission);
                            return (
                              <Table.Td key={role.role} ta="center">
                                {allowed ? (
                                  <span className={classes.allowed}>
                                    <IconCheck size={14} stroke={2.6} aria-hidden />
                                    <VisuallyHidden>Allowed</VisuallyHidden>
                                  </span>
                                ) : (
                                  <span className={classes.denied}>
                                    <IconMinus size={14} stroke={2} aria-hidden />
                                    <VisuallyHidden>Not allowed</VisuallyHidden>
                                  </span>
                                )}
                              </Table.Td>
                            );
                          })}
                    </Table.Tr>
                  ))}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Box>
      <Text size="xs" c="var(--mo-color-text-muted)">
        Profit, margins and expenses are visible to super admins only. Roles are fixed by the system; assign people to the one that fits.
        {customers ? ` ${formatCount(customers.userCount)} customer accounts have no back-office access.` : ""}
      </Text>
    </Stack>
  );
}
