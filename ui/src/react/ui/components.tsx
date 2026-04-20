import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHero(props: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="panel overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 p-6 lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-600">
            {props.eyebrow}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{props.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">{props.description}</p>
        </div>
        {props.actions ? <div className="flex flex-wrap gap-3">{props.actions}</div> : null}
      </div>
    </div>
  );
}

export function SectionCard(props: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel rounded-[24px] p-5 lg:p-6", props.className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{props.title}</h2>
          {props.subtitle ? (
            <p className="mt-1 text-sm leading-6 text-slate-500">{props.subtitle}</p>
          ) : null}
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50/70"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50/70"
        : "border-slate-200 bg-white/80";
  return (
    <div className={clsx("rounded-3xl border p-4 shadow-sm", toneClasses)}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{props.value}</p>
      {props.hint ? <p className="mt-2 text-sm text-slate-500">{props.hint}</p> : null}
    </div>
  );
}

export function StatusBadge(props: { value: string | null | undefined }) {
  const value = (props.value ?? "unknown").toString();
  const lowered = value.toLowerCase();
  const classes =
    lowered.includes("online") || lowered.includes("healthy") || lowered.includes("enabled")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : lowered.includes("warn") || lowered.includes("pending") || lowered.includes("todo")
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : lowered.includes("error") ||
            lowered.includes("failed") ||
            lowered.includes("offline") ||
            lowered.includes("blocked")
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1", classes)}>
      {value}
    </span>
  );
}

export function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
      <h3 className="text-sm font-semibold text-slate-700">{props.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{props.description}</p>
    </div>
  );
}

export function KeyValueGrid(props: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
            {item.label}
          </p>
          <div className="mt-2 break-words text-sm text-slate-800">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function MonoBlock(props: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-[20px] border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
      {props.value}
    </pre>
  );
}

export function JsonBlock(props: { value: unknown }) {
  return <MonoBlock value={JSON.stringify(props.value, null, 2)} />;
}

export function Toolbar(props: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex flex-wrap items-center gap-3", props.className)}>{props.children}</div>;
}

export function DataTable(props: {
  columns: Array<{ key: string; title: string; className?: string }>;
  rows: Array<Record<string, ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {props.columns.map((column) => (
                <th
                  key={column.key}
                  className={clsx(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500",
                    column.className,
                  )}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {props.rows.map((row, index) => (
              <tr key={String(row.key ?? index)} className="align-top">
                {props.columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-slate-700">
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FieldGroup(props: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label mb-0">{props.label}</span>
      {props.description ? <span className="block text-sm text-slate-500">{props.description}</span> : null}
      {props.children}
    </label>
  );
}

export function ModuleTabs<T extends string>(props: {
  tabs: Array<{ key: T; label: string; hint?: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={clsx(
            "rounded-2xl border px-4 py-2 text-sm font-medium transition",
            props.active === tab.key
              ? "border-brand-500 bg-brand-600 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700",
          )}
          onClick={() => props.onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
