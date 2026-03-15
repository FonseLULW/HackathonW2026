type AgentCallProps = {
  command: string;
};

export function AgentCall({ command }: AgentCallProps) {
  return (
    <p className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 leading-6 text-slate-700">
      <span className="mr-2 text-emerald-500">$</span>
      {command}
    </p>
  );
}
