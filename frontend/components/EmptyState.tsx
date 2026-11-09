import type { CSSProperties, ReactNode } from "react";
import {
  EmptyState as MantineEmptyState,
  Paper,
  type MantineColor,
  type MantineSize,
} from "@mantine/core";
import { IconMoodEmpty } from "@tabler/icons-react";

export interface EmptyStateProps {
  /** Short headline, e.g. "Your cart is empty". */
  title: ReactNode;
  /** Supporting copy. */
  description?: ReactNode;
  /** A Tabler icon element. Defaults to `<IconMoodEmpty />`. */
  icon?: ReactNode;
  /** Call(s) to action, e.g. `<BrandButton component={Link} href="/products">Shop now</BrandButton>`. */
  action?: ReactNode;
  /** Indicator tint. Default `primaryPink`. */
  color?: MantineColor;
  size?: MantineSize;
  /** Heading level for the title (keeps the document outline correct). Default 3. */
  titleOrder?: 2 | 3 | 4;
  /** Wrap in a bordered surface card (default `true`). Set `false` inside existing cards. */
  withCard?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Brand empty / zero-result / error state, built on Mantine's `EmptyState`.
 * (Import this one from `components/` — it applies brand defaults.)
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  color = "primaryPink",
  size = "md",
  titleOrder = 3,
  withCard = true,
  className,
  style,
}: EmptyStateProps) {
  const content = (
    <MantineEmptyState size={size} variant="light" color={color} py="xl">
      <MantineEmptyState.Indicator>{icon ?? <IconMoodEmpty stroke={1.6} />}</MantineEmptyState.Indicator>
      <MantineEmptyState.Title order={titleOrder} ff="var(--mo-font-heading)" c="var(--mo-color-text)">
        {title}
      </MantineEmptyState.Title>
      {description ? (
        <MantineEmptyState.Description c="var(--mo-color-text-muted)">
          {description}
        </MantineEmptyState.Description>
      ) : null}
      {action ? <MantineEmptyState.Actions>{action}</MantineEmptyState.Actions> : null}
    </MantineEmptyState>
  );

  if (!withCard) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <Paper withBorder radius="md" p="lg" className={className} style={style}>
      {content}
    </Paper>
  );
}
