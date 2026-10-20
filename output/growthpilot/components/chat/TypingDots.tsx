/** Three pulsing dots: the only constant-motion indicator in the chat (streaming reply pending). */
export function TypingDots({ label = "Agents are typing" }: { label?: string }) {
  return (
    <span className="typing-dots" role="status" aria-label={label}>
      <i /><i /><i />
    </span>
  );
}
