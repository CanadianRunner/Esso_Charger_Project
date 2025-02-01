import React from "react";
import "../styles/EnergyPrice.scss";

function EnergyPrice({ price }) {
  const priceString = price.toFixed(2);  // "0.13"
  const [wholePart, centsPart] = priceString.split(".");

  const dials = [
    `${wholePart}.`,
    centsPart[0],
    centsPart[1],
  ];

  return (
    <div className="price-dials">
      {dials.map((digit, index) => (
        <div key={index} className="dial">
          <span className="large-digit">{digit}</span>
        </div>
      ))}
    </div>
  );
}

export default EnergyPrice;
