import React from "react";
import "../styles/ThisSaleDisplay.scss";

function ThisSaleDisplay({ cost }) {
  const costString = cost.toFixed(1);
  const [dollars, tenths] = costString.split('.');

  let firstDial, secondDial, thirdDial;

  if (cost < 100) {
    firstDial = dollars.length > 1 ? dollars[0] : "0";
    secondDial = dollars.slice(-1);
  } else {
    firstDial = dollars.length > 2 ? dollars[0] : "0";
    secondDial = dollars.slice(-2, -1) + dollars.slice(-1);
  }

  thirdDial = tenths;

  return (
    <div className="sale-dials">
      <div className="dial">
        <span className="large-digit">{firstDial}</span>
      </div>
      <div className="dial">
        <span className="large-digit">{secondDial}</span>
      </div>
      <div className="dial with-tenths">
        <div className="tenths-container">
          <span className="tenths-num">{thirdDial}</span>
          <span className="tenths-fraction">/10</span>
        </div>
      </div>
    </div>
  );
}

export default ThisSaleDisplay;
