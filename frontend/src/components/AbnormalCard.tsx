import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Obs } from "../api";
import Icon from "./Icon";
import RangeGauge from "./RangeGauge";
import { Badge, FLAG } from "./ui";

// One lab value: name, big number, status badge (icon + text), range gauge, optional explanation.
export default function AbnormalCard({ name, value, flag, obs, children }:
  { name: string; value: string; flag?: string | null; obs?: Obs; children?: ReactNode }) {
  const { t } = useTranslation();
  const f = FLAG[flag ?? ""];
  const crit = flag === "LL" || flag === "HH";
  return (
    <article className={`card overflow-hidden ${crit ? "border-crit/50" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"
          style={f ? { background: `var(--${f.tone}-soft)`, color: `var(--${f.tone})` } : undefined}>
          <Icon name="flask" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{name}</h3>
            {f && <Badge tone={f.tone} icon={f.icon}>{t(f.label)}</Badge>}
          </div>
          <p className="h-display mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          {obs && obs.value_num != null && (
            <RangeGauge value={obs.value_num} low={obs.ref_low} high={obs.ref_high} unit={obs.unit} flag={flag} />
          )}
        </div>
      </div>
      {children && <div className="space-y-2.5 border-t border-line bg-surface-2 p-4 text-sm leading-relaxed">{children}</div>}
    </article>
  );
}
