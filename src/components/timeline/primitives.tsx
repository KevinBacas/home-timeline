"use client";

import * as Dialog from "@radix-ui/react-dialog";

import { motion } from "motion/react";
import {
  Activity,
  House,
  Lightbulb,
  LockKeyhole,
  Play,
  Radio,
  Thermometer,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { type Category } from "@/lib/types";

const icons: Record<Category, LucideIcon> = {
  presence: House,
  security: LockKeyhole,
  lighting: Lightbulb,
  climate: Thermometer,
  motion: Activity,
  media: Play,
  automation: Zap,
  device: Unplug,
  system: Radio,
};
export const labels: Record<Category, string> = {
  presence: "Presence",
  security: "Security",
  lighting: "Lighting",
  climate: "Climate",
  motion: "Motion",
  media: "Media",
  automation: "Automations",
  device: "Devices",
  system: "System",
};
export function Icon({
  category,
  size = 18,
}: {
  category: Category;
  size?: number;
}) {
  const I = icons[category];
  return <I size={size} strokeWidth={1.65} />;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={`modal ${wide ? "inspector" : ""}`}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Explore your home activity."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
