import React, { useState, useEffect } from "react";

function LifetimeAndMonthlyKWH({ metrics }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const MAX_DIGITS = 11; // Set to maximum needed (lifetime display)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % metrics.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [metrics.length]);

  const currentMetric = metrics[currentIndex];
  const numValue = parseFloat(currentMetric.value);
  

  const displayChars = Array(MAX_DIGITS).fill(' ');
  
  const formattedValue = `${numValue.toFixed(2)} kWh`;
  const valueChars = formattedValue.split('');
  
  const startIndex = MAX_DIGITS - valueChars.length;
  valueChars.forEach((char, index) => {
    displayChars[startIndex + index] = char;
  });

  return (
    <div className="lifetime-monthly-kwh">
      <div className="metric-value">
        <span className="digit-box icon-box">
          {currentMetric.icon.trim()}
        </span>
        {displayChars.map((char, index) => (
          <span key={index} className="digit-box">
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LifetimeAndMonthlyKWH;
