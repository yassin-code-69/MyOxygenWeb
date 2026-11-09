"use client";

import { useState } from "react";
import { Button, CloseButton, Select, Stack, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import { useCustomers } from "../../../hooks/admin/use-customers";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_CUSTOMER_SORTS, type AdminCustomerSort } from "../../../types/admin-management";
import { FilterBar } from "../FilterBar";
import { PageHeader } from "../kit";
import { readEnum, readPositiveInt, useUrlParams } from "../payments/url-state";
import { CustomerDrawer } from "./CustomerDrawer";
import { CustomerKpis } from "./CustomerKpis";
import { CustomersTable } from "./CustomersTable";

const SORT_OPTIONS: { value: AdminCustomerSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "spend_desc", label: "Highest spend" },
  { value: "orders_desc", label: "Most orders" },
];

const DEFAULT_LIMIT = 20;

/**
 * `/admin/customers` (ORDERS_READ). URL state: `?q`, `?sort`, `?page`,
 * `?limit`, `?customerId` (opens the detail drawer).
 */
export function CustomersView() {
  const { searchParams, setParams } = useUrlParams();
  const canAnalytics = useCan(PERMISSIONS.ANALYTICS_READ);

  const q = searchParams.get("q") ?? "";
  const sort = readEnum(searchParams.get("sort"), ADMIN_CUSTOMER_SORTS, "newest");
  const page = readPositiveInt(searchParams.get("page"), 1);
  const limit = readPositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 100);
  const customerId = searchParams.get("customerId");

  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim(), page: null }), 300);

  const list = useCustomers({ page, limit, q, sort });
  const activeFilters = (q ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    setParams({ q: null, sort: null, page: null });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconUsers size={20} />}
        title="Customers"
        subtitle="Everyone with an account in your store — their orders, spend and delivery addresses."
        mb={0}
      />

      {canAnalytics ? <CustomerKpis /> : null}

      <div>
        <FilterBar activeCount={activeFilters} onReset={clearFilters}>
          <TextInput
            aria-label="Search customers"
            placeholder="Search name, phone or email"
            radius="xl"
            leftSection={<IconSearch size={16} aria-hidden />}
            rightSection={
              search ? (
                <CloseButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    pushSearch.cancel();
                    setParams({ q: null, page: null });
                  }}
                />
              ) : null
            }
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              pushSearch(event.currentTarget.value);
            }}
            style={{ flex: "1 1 260px" }}
            maw={420}
          />
          <Select
            aria-label="Sort customers"
            radius="xl"
            w={180}
            data={SORT_OPTIONS}
            value={sort}
            allowDeselect={false}
            onChange={(value) => setParams({ sort: value && value !== "newest" ? value : null, page: null })}
          />
        </FilterBar>

        <CustomersTable
          rows={list.data?.items}
          meta={list.data?.meta}
          loading={list.isLoading}
          refreshing={list.isValidating}
          error={list.error}
          onRetry={() => void list.mutate()}
          sort={sort}
          onSortChange={(next) => setParams({ sort: next === "newest" ? null : next, page: null })}
          onOpen={(customer) => setParams({ customerId: customer.id })}
          onPageChange={(next) => setParams({ page: next > 1 ? next : null })}
          onLimitChange={(next) => setParams({ limit: next === DEFAULT_LIMIT ? null : next, page: null })}
          query={q}
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" color="secondaryGreen" radius="xl" onClick={clearFilters}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      </div>

      <CustomerDrawer customerId={customerId} onClose={() => setParams({ customerId: null })} />
    </Stack>
  );
}
