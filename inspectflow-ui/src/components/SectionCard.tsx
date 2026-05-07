import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
};

export default function SectionCard({ title, children, right }: Props) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}
