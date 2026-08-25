import type { ReactNode } from "react";

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-xl">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
