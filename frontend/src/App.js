import React, { useState, useEffect } from "react";
import ThisSaleDisplay from "./components/ThisSaleDisplay";
import RotatingMetricsDisplays from "./components/RotatingMetricsDisplays";
import DeliveredEnergy from "./components/DeliveredEnergy";
import EnergyPrice from "./components/EnergyPrice";
import axios from "axios";
//import { FaInfinity, FaCalendar, FaBolt, FaClock } from "react-icons/fa";

function App() {
  return (
    <div className="App">
      <ThisSaleDisplay cost={12.45} />
      <RotatingMetricsDisplays
        metrics={[
          { icon: "∞", value: "12345.67 kWh" },
          { icon: "📅", value: "456.78 kWh" },
        ]}
      />
      <RotatingMetricsDisplays
        metrics={[
          { icon: "⚡", value: "11.5 kW" },
          { icon: "⏱️", value: "01:15:32" },
        ]}
      />
      <DeliveredEnergy kWh={5.75} />
      <EnergyPrice price={0.13} />
    </div>
  );
}

export default App;
