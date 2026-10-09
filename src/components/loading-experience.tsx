"use client";

import { useEffect, useState } from "react";

const messages = ["Loading your experience…", "Making space for your way of learning…", "Preparing your lesson…", "A little more time for your learning…"];

/** Presentation messages are reassurance, never backend progress or an ETA. */
export function LoadingExperience({ active, compact = false, onCancel }: { active: boolean; compact?: boolean; onCancel?: () => void }) {
  const [message, setMessage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setMessage(index => (index + 1) % messages.length), 6000);
    return () => window.clearInterval(timer);
  }, [active]);
  return <div className={`loading-experience ${compact ? "compact" : "panel-loading"}`} data-active={active}>
    <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{active ? "Preparing your learning experience. Please wait." : ""}</span>
    {active && <div className="loading-content">
      <div className="learning-motif" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="loading-copy" aria-hidden="true"><p className="loading-kicker">Your learning, your way</p><p className="loading-message" key={message}>{messages[message]}</p><p className="loading-reassurance">A different way in. The same depth of learning.</p></div>
      {onCancel && <button type="button" className="adapt-secondary loading-cancel" onClick={onCancel}>Cancel</button>}
    </div>}
  </div>;
}
