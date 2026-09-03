'use client';

// One fault dealt with on a visit: what was wrong, what the engineer did, and
// proof it's working afterwards. onPhotoChange takes which photo is being set
// ('problem' | 'working') since there are two per issue.
export function VisitIssueCard({ issue, index, showRemove, onRemove, onChange, onPhotoChange }) {
  return (
    <div className="loc-card">
      <div className="loc-head">
        <div className="loc-num">Issue #{index + 1}</div>
        {showRemove && <button type="button" className="remove" onClick={onRemove}>Remove</button>}
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Issue (optional)</label>
          <input value={issue.title} onChange={(e) => onChange('title', e.target.value)} placeholder="e.g. Screen 2 — no picture, media player offline" />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Photo of the Problem</label>
          <input type="file" accept="image/*" onChange={(e) => { onPhotoChange('problem', e.target.files[0]); e.target.value = ''; }} />
          {issue.problemPreview && (
            <img src={issue.problemPreview} alt="The problem" className="proof-photo" />
          )}
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>What Was Done to Fix It</label>
          <textarea value={issue.fix} onChange={(e) => onChange('fix', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Photo of the Screen Working</label>
          <input type="file" accept="image/*" onChange={(e) => { onPhotoChange('working', e.target.files[0]); e.target.value = ''; }} />
          {issue.workingPreview && (
            <img src={issue.workingPreview} alt="Screen working" className="proof-photo" />
          )}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Resolved?</label>
          <div className="segmented">
            <button type="button" className={issue.resolved === 'Yes' ? 'on' : ''} onClick={() => onChange('resolved', 'Yes')}>Yes</button>
            <button type="button" className={issue.resolved === 'No' ? 'on warn' : ''} onClick={() => onChange('resolved', 'No')}>No</button>
          </div>
        </div>
      </div>
    </div>
  );
}
