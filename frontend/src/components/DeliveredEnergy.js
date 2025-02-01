import React from "react";
import "../styles/DeliveredEnergy.scss";

function DeliveredEnergy({ kWh }) {
  const kWhString = kWh.toFixed(1);
  const [wholePart, tenthsPart] = kWhString.split(".");

  return (
    <div className="delivered-energy-dials">
      <div className="dial">
        <span className="large-digit">{wholePart.length > 1 ? wholePart[0] : "0"}</span>
      </div>
      <div className="dial">
        <span className="large-digit">{wholePart.slice(-1)}</span>
      </div>
      <div className="dial with-tenths">
        <div className="tenths-container">
          <span className="tenths-num">{tenthsPart}</span>
          <span className="tenths-fraction">/10</span>
        </div>
        <div className="static-arrow"></div>
      </div>
    </div>
  );
}

export default DeliveredEnergy;
