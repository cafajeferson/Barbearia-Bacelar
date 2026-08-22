"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getOwnNotificationsAction, markNotificationReadAction } from "../actions";

type Notification = Awaited<ReturnType<typeof getOwnNotificationsAction>>[number];

function describeTemplate(n: Notification): string {
  if (n.template === "retention_coupon") {
    const payload = n.payload as { code?: string } | null;
    return `Você ganhou um cupom de retorno: ${payload?.code ?? ""}`;
  }
  return n.template;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (open) getOwnNotificationsAction().then(setNotifications);
  }, [open]);

  const unread = notifications.filter((n) => n.status !== "READ").length;

  async function handleClick(n: Notification) {
    if (n.status !== "READ") {
      await markNotificationReadAction({ notificationId: n.id });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: "READ" } : x)));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-md p-2 text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Notificações</div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                  n.status === "READ" ? "text-muted-foreground" : "font-medium"
                }`}
              >
                {describeTemplate(n)}
                <p className="text-[10px] text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(n.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
