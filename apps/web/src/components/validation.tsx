import { AlertTriangle, CheckCircle2, Crown, XCircle } from "lucide-react";
import type { ValidationIssue, ValidationReport, ValidationSeverity } from "@rpg-forge/rules-engine";
import { cn } from "@rpg-forge/ui/lib/utils";

export const SEVERITY_UI: Record<ValidationSeverity, { label: string; icon: typeof CheckCircle2; className: string }> = {
  valid: { label: "Válido", icon: CheckCircle2, className: "text-success border-success/40 bg-success/10" },
  warning: { label: "Atenção", icon: AlertTriangle, className: "text-warning border-warning/40 bg-warning/10" },
  invalid: { label: "Inválido", icon: XCircle, className: "text-destructive border-destructive/40 bg-destructive/10" },
  gm_approval: { label: "Aprovação do mestre", icon: Crown, className: "text-gm border-gm/40 bg-gm/10" },
};

export function SeverityBadge({ status, className }: { status: ValidationSeverity; className?: string }) {
  const ui = SEVERITY_UI[status];
  const Icon = ui.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", ui.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {ui.label}
    </span>
  );
}

/** Nomes exibidos para livros cujo título é marca registrada de terceiros (OGL 1.0a, seção 7). */
const SOURCEBOOK_LABEL: Record<string, string> = { "t20-2020": "Livro básico (2020)" };

function sourceLabel(i: ValidationIssue): string | null {
  if (!i.source) return null;
  const s = i.source;
  return [SOURCEBOOK_LABEL[s.sourcebookId] ?? s.sourcebookId.toUpperCase(), s.section, s.page ? `p. ${s.page}` : null].filter(Boolean).join(" · ");
}

export function IssueList({ issues, empty = "Nenhuma pendência." }: { issues: ValidationIssue[]; empty?: string }) {
  if (!issues.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-2" aria-live="polite">
      {issues.map((i, idx) => {
        const ui = SEVERITY_UI[i.severity];
        const Icon = ui.icon;
        const src = sourceLabel(i);
        return (
          <li key={`${i.code}-${i.path ?? ""}-${idx}`} className={cn("flex gap-2 rounded-md border p-2.5 text-sm", ui.className)}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <span className="sr-only">{ui.label}: </span>
              <span className="text-foreground">{i.message}</span>
              {src && <p className="mt-0.5 text-xs text-muted-foreground">Fonte: {src}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportSummary({ report }: { report: ValidationReport }) {
  return (
    <div className="space-y-3">
      <SeverityBadge status={report.status} />
      <IssueList issues={report.issues} empty="Tudo certo: nenhuma regra violada até aqui." />
    </div>
  );
}
