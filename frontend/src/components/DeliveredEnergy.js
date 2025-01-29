import React from "react";
import "../styles/DeliveredEnergy.scss";

function DeliveredEnergy({ kWh }) {
  return (
    <div className="delivered-energy">
      <span className="metric-label">kWh Delivered</span>
      <span className="metric-value">{kWh.toFixed(2)} kWh</span>
    </div>
  );
}

export default DeliveredEnergy;
