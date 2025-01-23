# _Esso Pump EV Charger Conversion_

#### By _**Sean Keane**_

#### Portfolio Page Capstone - Epicodus Code Review 01/22/2025

## Technologies Used

* React
* Python

## Description

This is a personal project I've undertaken that combines my love for software and hardware.  I am converting a restored 1950s gas pump into an electric vehicle charger.  This project goes beyond charging infrastructure; I plan on replacing the rotary dials with cleverly disguised displays that will output the number of kWh delivered, charge cost (based on my home rates), and other relevant metrics.  I will utilize a React frontend and Python for my backend.

I plan to update this README with images and my progress as I tackle the unforeseen challenges of bringing this project to life.

## Update #1 (01/22/2025)

I've acquired my gas pump and started the project's hardware and software planning phase! 

_My hardware decisions thus far:_

I plan to use Tesla's HPWC to juice up my vehicles physically.  I will use OpenEVSE's Wi-Fi kit and C-clamp adapters to measure and report the kWh delivered each session.  I will use a Raspberry Pi 5 to run my application and consume/output data.  I will use two small outdoor-rated displays in place of the physical rotary dials.  I will have to run 240-v power to the charger, 120v to the supporting infrastructure, and ethernet to the Raspberry Pi (I imagine Wi-Fi will be spotty in my new Esso branded Faraday box).  To protect this project, I will need to make additional improvements to the waterproofing, airflow, and humidity control.

_On the software front:_

I have scaffolded a rough starting point for the application, with the frontend (React) and backend (Python) contained in the same directory.  I want to consume an API that pulls my power company price per/kWh to prevent the need for manual updates over the years.  I would like to display the lifetime kWh delivered so I can take preventative measures in case of unit failure, power outages, etc.  I will send saved metrics to my remote server as a failover, as I'd like to utilize this system for years to come.

## Restored Pump:

![RestoredPump](images/starter_pump.png)


## Known Bugs

* No known bugs


## License

If you have any questions or concerns feel free to contact me at code@sean-keane.com

*This is licensed under the MIT license*

Copyright (c) 01-22-2025 **_Sean Keane_**
