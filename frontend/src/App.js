import React from "react";
import ThisSaleDisplay from "./components/ThisSaleDisplay";
import LifetimeAndMonthlyKWh from "./components/LifeTimeAndMonthlyKWH";
import PowerAndElapsedTime from "./components/PowerAndElapsedTime";
import DeliveredEnergy from "./components/DeliveredEnergy";
import EnergyPrice from "./components/EnergyPrice";
import "./App.css";

function App() {
  const lifetimeMetrics = [
    { icon: " 📅 ", value: "456.78 kWh" },  // Using Unicode escape sequence
    { icon: "∞", value: "12345.67 kWh" },
  ];

  const powerMetrics = [
    { icon: "⚡", value: "11.5 kW" },
    { icon: "⏱️", value: "01:15:32" },
  ];

  return (
    <div className="App">
      <ThisSaleDisplay cost={123.45} />
      <LifetimeAndMonthlyKWh metrics={lifetimeMetrics} />
      <PowerAndElapsedTime metrics={powerMetrics} />
      <div style={{ display: "flex", gap: "20px" }}>
        <DeliveredEnergy kWh={5.75} />
        <EnergyPrice price={0.13} />
      </div>
      <div>
  📅 Calendar Emoji Test
</div>
    </div>
  );
}

export default App;
