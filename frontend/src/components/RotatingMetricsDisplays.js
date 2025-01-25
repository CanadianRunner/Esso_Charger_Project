import React, { useState, useEffect } from "react";
import "../styles/RotatingMetricsDisplays.scss";

function RotatingMetricDisplay({ metrics }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % metrics.length);
    }, 4000); // Rotate every 4 seconds

    return () => clearInterval(interval);
  }, [metrics.length]);

  const currentMetric = metrics[currentIndex];

  return (
    <div className="rotating-metric-display">
      <span className="metric-icon">{currentMetric.icon}</span>
      <span className="metric-value">{currentMetric.value}</span>
    </div>
  );
}

export default RotatingMetricDisplay;