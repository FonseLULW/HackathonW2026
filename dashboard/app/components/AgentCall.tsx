type AgentCallProps = {
  command: string;
};

export function AgentCall({ command }: AgentCallProps) {
  return (
    <p>
      <span className="text-emerald-300">$</span> {command}
    </p>
  );
}
