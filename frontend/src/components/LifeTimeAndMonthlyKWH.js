import React, { useState, useEffect } from "react";
import "../styles/LifeTimeAndMonthlyKWH.scss";

const MAX_DIGITS = 8;

function LifetimeAndMonthlyKWH({ metrics }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % metrics.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [metrics.length]);

  const currentMetric = metrics[currentIndex];
  const paddedValue = currentMetric.value.padStart(MAX_DIGITS - 1, " ");
  const fullValue = `${currentMetric.icon}${paddedValue}`;

  return (
    <div className="lifetime-monthly-kwh">
      <div className="metric-value">
        {fullValue.padEnd(MAX_DIGITS, " ").split("").map((char, index) => (
          <span key={index} className="digit-box">
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LifetimeAndMonthlyKWH;