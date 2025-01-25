import React from "react";
import "../styles/ThisSaleDisplay.scss";

function ThisSaleDisplay({ cost }) {
  return (
    <div className="this-sale-display">
      <span className="sale-label">This Sale</span>
      <span className="sale-value">${cost.toFixed(2)}</span>
    </div>
  );
}

export default ThisSaleDisplay;