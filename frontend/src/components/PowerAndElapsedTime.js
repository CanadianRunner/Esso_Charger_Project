import React, { useState, useEffect } from "react";

function PowerAndElapsedTime({ metrics }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % metrics.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [metrics.length]);

  const currentMetric = metrics[currentIndex];
  const isPower = currentMetric.icon === "⚡";
  const MAX_DIGITS = 11;  // Fixed 8 digits for both power and time
  
  const formattedValue = isPower
    ? parseFloat(currentMetric.value).toFixed(1).padStart(MAX_DIGITS - 3, ' ') + " kW"
    : currentMetric.value.padStart(MAX_DIGITS, ' ');

  return (
    <div className="power-elapsed-time">
      <div className="metric-value">
        <span className="digit-box icon-box">
          {currentMetric.icon.trim()}
        </span>
        {formattedValue.split('').map((char, index) => (
          <span key={index} className="digit-box">
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}

export default PowerAndElapsedTime;
