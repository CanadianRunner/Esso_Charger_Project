import React from "react";
import "../styles/EnergyPrice.scss";

function EnergyPrice({ price }) {
  return (
    <div className="energy-price">
      <span className="metric-label">Price per kWh</span>
      <span className="metric-value">${price.toFixed(2)}</span>
    </div>
  );
}

export default EnergyPrice;