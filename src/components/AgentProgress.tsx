import React from 'react';

export const AgentProgress: React.FC<{ label: string; percent: number }> = ({ label, percent }) => {
  return (
    <div className="card vstack">
      <div className="hstack" style={{justifyContent:'space-between'}}>
        <span>{label}</span>
        <span className="small">{percent}%</span>
      </div>
      <div className="progress"><div style={{ width: `${percent}%` }} /></div>
    </div>
  );
};
