/** Projector-safe: first name + last initial + agent. Never pass phone or email. */
export function ProjectorName({
  displayName,
  invitedBy,
  large = false,
}: {
  displayName: string;
  invitedBy?: string;
  large?: boolean;
}) {
  return (
    <div className="text-center" data-testid="projector-name">
      <p className={large ? 'text-5xl sm:text-7xl font-black tracking-tight' : 'text-3xl font-black'}>
        {displayName}
      </p>
      {invitedBy ? (
        <p className="mt-3 text-sm sm:text-base text-slate-300">Invited by {invitedBy}</p>
      ) : null}
    </div>
  );
}
