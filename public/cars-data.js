// Shared vehicle dataset for the order + checkout pages.
// All prices are in USD; every purchase is settled in cryptocurrency via the payment modal.
window.CARS = {
  cybertruck: {
    slug: 'cybertruck',
    name: 'Tesla Cybertruck',
    year: 2020,
    model: 'Cybertruck',
    price: 79990,
    priceLabel: '$79,990.00',
    image: '/assets/cars/cybertruck.jpg',
    badge: 'Featured',
    tagline: 'Built for any adventure — an armored, all-electric pickup.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Dual Motor All-Wheel Drive' },
      { label: 'Seating', value: '6' },
      { label: 'Horsepower', value: '600 hp' },
      { label: 'Battery', value: '122 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '20" All-Season' },
      { label: 'Towing Capacity', value: '11,000 lb' },
      { label: 'Payload Capacity', value: '2,500 lb' },
      { label: 'Exterior', value: 'Ultra-Hard Stainless Steel' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 150,000 mi' }
    ],
    description: 'Cybertruck pairs the utility of a truck with the performance of a sports car, wrapped in an armored exoskeleton. It can pull up to 11,000 pounds, seat six adults, and still deliver over 400 miles of range on a single charge.'
  },
  'model-s': {
    slug: 'model-s',
    name: 'Tesla Model S',
    year: 2022,
    model: 'Model S',
    price: 74990,
    priceLabel: '$74,990.00',
    image: '/assets/cars/model-s.jpg',
    badge: 'Featured',
    tagline: 'The most aerodynamic production car ever made.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Dual Motor All-Wheel Drive' },
      { label: 'Seating', value: '5' },
      { label: 'Horsepower', value: '670 hp' },
      { label: 'Battery', value: '100 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '19" Tempest' },
      { label: 'Interior', value: 'Vegan Leather + Wood Décor' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 150,000 mi' }
    ],
    description: 'Model S delivers instant torque and a refined cabin, all wrapped in the most aerodynamic body ever produced. With dual-motor all-wheel drive, it is engineered for both comfort and control.'
  },
  'model-y': {
    slug: 'model-y',
    name: '2024 Tesla Model Y',
    year: 2024,
    model: 'Model Y',
    price: 42000,
    priceLabel: '$42,000.00',
    image: '/assets/cars/model-y.jpg',
    badge: null,
    tagline: 'A versatile, fully electric midsize SUV.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Dual Motor All-Wheel Drive' },
      { label: 'Seating', value: '5 (7 optional)' },
      { label: 'Horsepower', value: '384 hp' },
      { label: 'Battery', value: '75 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '19" Gemini' },
      { label: 'Towing Capacity', value: '3,500 lb' },
      { label: 'Cargo Volume', value: '76 cu ft' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 120,000 mi' }
    ],
    description: 'Model Y is the all-electric midsize SUV that balances range, utility and value. A roomy cabin, generous cargo space and towing capability make it ready for daily life and weekend trips alike.'
  },
  'model-x': {
    slug: 'model-x',
    name: 'Tesla Model X',
    year: 2021,
    model: 'Model X',
    price: 36000,
    priceLabel: '$36,000.00',
    image: '/assets/cars/model-x.jpg',
    badge: null,
    tagline: 'Suv performance with falcon-wing doors and panoramic views.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Dual Motor All-Wheel Drive' },
      { label: 'Seating', value: '6 / 7' },
      { label: 'Horsepower', value: '670 hp' },
      { label: 'Battery', value: '100 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '20" Cyberstream' },
      { label: 'Doors', value: 'Falcon Wing Rear Doors' },
      { label: 'Glass', value: 'Panoramic Windshield' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 150,000 mi' }
    ],
    description: 'Model X offers a spacious cabin with the largest glass windshield in production. Falcon-wing doors and up to seven seats make every journey comfortable and effortless.'
  },
  'model-3': {
    slug: 'model-3',
    name: 'Tesla Model 3 Long Range',
    year: 2024,
    model: 'Model 3',
    price: 47240,
    priceLabel: '$47,240.00',
    image: '/assets/cars/model-3.jpg',
    badge: null,
    tagline: 'An all-electric sedan built for performance and safety.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Dual Motor All-Wheel Drive' },
      { label: 'Seating', value: '5' },
      { label: 'Horsepower', value: '358 hp' },
      { label: 'Battery', value: '82 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '18" Photon' },
      { label: 'Interior', value: 'Minimalist + Center Display' },
      { label: 'Safety', value: '5-Star NHTSA Rating' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 100,000 mi' }
    ],
    description: 'Model 3 is built for performance and safety, delivering a responsive and refined drive with dual-motor traction, minimalist interior and industry-leading range.'
  },
  'model-x-plaid': {
    slug: 'model-x-plaid',
    name: 'Tesla Model X Plaid',
    year: 2024,
    model: 'Model X',
    price: 94990,
    priceLabel: '$94,990.00',
    image: '/assets/cars/model-x-plaid.jpg',
    badge: 'Featured',
    tagline: 'The quickest accelerating SUV in production.',
    range: '410 mi',
    accel: '3.1 s',
    topSpeed: '130 mph',
    specs: [
      { label: 'Drive', value: 'Tri Motor All-Wheel Drive' },
      { label: 'Seating', value: '6' },
      { label: 'Horsepower', value: '1,020 hp' },
      { label: 'Battery', value: '100 kWh' },
      { label: 'Charging', value: '250 kW Supercharging' },
      { label: 'Wheels', value: '22" Turbine' },
      { label: 'Torque', value: 'Ludicrous Launch Mode' },
      { label: 'Doors', value: 'Falcon Wing Rear Doors' },
      { label: 'Autopilot', value: 'Included' },
      { label: 'Vehicle Warranty', value: '4 yr / 50,000 mi' },
      { label: 'Battery Warranty', value: '8 yr / 150,000 mi' }
    ],
    description: 'Model X Plaid pairs tri-motor power with the utility of an SUV, delivering 1,020 horsepower and the quickest acceleration of any SUV ever built.'
  }
};

// Shared paint options (monochrome palette).
window.CAR_COLORS = [
  { name: 'Pearl White', hex: '#f5f5f0' },
  { name: 'Glacier White', hex: '#e8e8e6' },
  { name: 'Midnight Silver Metallic', hex: '#9b9ea6' },
  { name: 'Deep Gray Metallic', hex: '#3a3d42' },
  { name: 'Solid Black', hex: '#171a20' }
];

// Helper: resolve a car slug (with fallback).
window.findCar = function (slug) {
  return CARS[slug] || CARS.cybertruck;
};
