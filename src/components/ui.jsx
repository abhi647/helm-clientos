"use client";
import { useEffect, useRef } from "react";
import {
  X,
  ArrowUpRight,
  LockKeyhole,
  Users,
  Check,
  ChevronRight,
} from "lucide-react";
import { PEOPLE } from "../domain.mjs";
export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Avatar({ id = "ar", size = "", label = false, name }) {
  const p = name
    ? {
        name,
        initials: name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase(),
        color: "teal",
      }
    : PEOPLE.find((p) => p.id === id) || PEOPLE[0];
  return (
    <span className="person">
      <span className={`avatar ${p.color} ${size}`} title={p.name}>
        {p.initials}
      </span>
      {label && p.name}
    </span>
  );
}
export function Badge({ children, tone }) {
  const map = {
    "On track": "green",
    Done: "green",
    Approved: "green",
    Pending: "amber",
    "Needs attention": "amber",
    "In progress": "blue",
    "In review": "purple",
    Draft: "neutral",
    Delivered: "green",
    Rejected: "red",
  };
  return (
    <span className={`badge ${tone || map[children] || "neutral"}`}>
      {children}
    </span>
  );
}
export function Visibility({ value }) {
  return (
    <span className="visibility">
      {value === "Internal" ? <LockKeyhole size={12} /> : <Users size={12} />}{" "}
      {value}
    </span>
  );
}
export function Empty({
  icon: Icon = Check,
  title = "Nothing here yet",
  text,
  children,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Panel({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll(
            'button,input,select,textarea,a,[tabindex="0"]',
          ),
        ].filter((n) => !n.disabled);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button
            aria-label="Close dialog"
            className="icon-btn"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Progress({ value }) {
  return (
    <span className="progress-wrap">
      <span className="progress-track">
        <span style={{ width: `${value}%` }} />
      </span>
      <span>{value}%</span>
    </span>
  );
}
