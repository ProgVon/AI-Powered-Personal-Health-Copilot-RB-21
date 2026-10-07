import { createContext, ReactNode, useCallback, useContext, useState } from "react";
import Icon from "./Icon";

type T = { id: number; msg: string; bad: boolean };
const Ctx = createContext<(msg: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((msg: string, bad = false) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, msg, bad }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((x) => (
          <div key={x.id} className="toast card pointer-events-auto flex max-w-md items-center gap-2.5 px-4 py-3 text-sm font-medium">
            <Icon name={x.bad ? "alert" : "check"} className={`h-4 w-4 ${x.bad ? "text-crit" : "text-ok"}`} strokeWidth={2.4} />{x.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
