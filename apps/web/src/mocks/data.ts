/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Seed data for the mock walkthrough (PRD 0001). Three entities of differing
 * size — Northpoint is deliberately sparse so entity switching visibly
 * rescopes the screens. Pages access this data only through the selector
 * functions at the bottom; the selector signatures are the seam a future API
 * client replaces (see docs/RULES/web-shell.md).
 */

import type { Entity, Project, Invoice, InboxItem } from './types';

export const defaultEntityId = 'silverstone';

const entities: Entity[] = [
  { id: 'silverstone', code: 'SC', name: 'Silverstone Construction LLC' },
  { id: 'harbor', code: 'HD', name: 'Harbor Development Corp' },
  { id: 'northpoint', code: 'NP', name: 'Northpoint Builders Inc' },
];

const projects: Project[] = [
  // Silverstone Construction (5)
  {
    id: 'p-sc-101',
    entityId: 'silverstone',
    code: '24-101',
    name: 'Riverview Medical Office Building',
    status: 'active',
    manager: 'Dana Whitfield',
    startDate: '2026-01-12',
    budget: 8_450_000,
    committed: 6_120_000,
    actual: 4_385_000,
    lines: [
      {
        costCode: '02-200',
        description: 'Sitework & excavation',
        budget: 620_000,
        committed: 610_000,
        actual: 598_000,
      },
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 1_480_000,
        committed: 1_390_000,
        actual: 1_260_000,
      },
      {
        costCode: '05-100',
        description: 'Structural steel',
        budget: 2_150_000,
        committed: 2_020_000,
        actual: 1_540_000,
      },
      {
        costCode: '15-400',
        description: 'Plumbing',
        budget: 890_000,
        committed: 640_000,
        actual: 412_000,
      },
      {
        costCode: '16-100',
        description: 'Electrical',
        budget: 1_320_000,
        committed: 815_000,
        actual: 375_000,
      },
    ],
  },
  {
    id: 'p-sc-102',
    entityId: 'silverstone',
    code: '24-102',
    name: 'Maple Street Parking Structure',
    status: 'active',
    manager: 'Luis Ortega',
    startDate: '2026-02-02',
    budget: 5_200_000,
    committed: 3_910_000,
    actual: 2_140_000,
    lines: [
      {
        costCode: '02-200',
        description: 'Sitework & excavation',
        budget: 480_000,
        committed: 470_000,
        actual: 461_000,
      },
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 2_600_000,
        committed: 2_310_000,
        actual: 1_320_000,
      },
      {
        costCode: '05-500',
        description: 'Metal fabrications',
        budget: 740_000,
        committed: 590_000,
        actual: 214_000,
      },
      {
        costCode: '16-100',
        description: 'Electrical',
        budget: 520_000,
        committed: 310_000,
        actual: 145_000,
      },
    ],
  },
  {
    id: 'p-sc-103',
    entityId: 'silverstone',
    code: '25-103',
    name: 'Cedar Ridge Apartments Phase II',
    status: 'active',
    manager: 'Dana Whitfield',
    startDate: '2026-04-20',
    budget: 12_800_000,
    committed: 5_360_000,
    actual: 1_925_000,
    lines: [
      {
        costCode: '02-200',
        description: 'Sitework & excavation',
        budget: 940_000,
        committed: 905_000,
        actual: 812_000,
      },
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 2_450_000,
        committed: 1_760_000,
        actual: 690_000,
      },
      {
        costCode: '06-100',
        description: 'Rough carpentry',
        budget: 3_150_000,
        committed: 1_540_000,
        actual: 298_000,
      },
      {
        costCode: '07-500',
        description: 'Roofing & waterproofing',
        budget: 1_260_000,
        committed: 640_000,
        actual: 125_000,
      },
      {
        costCode: '15-400',
        description: 'Plumbing',
        budget: 1_480_000,
        committed: 515_000,
        actual: 0,
      },
    ],
  },
  {
    id: 'p-sc-104',
    entityId: 'silverstone',
    code: '25-104',
    name: 'Fairground Elementary Renovation',
    status: 'on-hold',
    manager: 'Priya Raman',
    startDate: '2026-03-09',
    budget: 3_600_000,
    committed: 1_120_000,
    actual: 640_000,
    lines: [
      {
        costCode: '02-050',
        description: 'Selective demolition',
        budget: 420_000,
        committed: 410_000,
        actual: 396_000,
      },
      {
        costCode: '09-250',
        description: 'Gypsum board assemblies',
        budget: 860_000,
        committed: 340_000,
        actual: 152_000,
      },
      {
        costCode: '15-800',
        description: 'HVAC',
        budget: 1_240_000,
        committed: 370_000,
        actual: 92_000,
      },
    ],
  },
  {
    id: 'p-sc-105',
    entityId: 'silverstone',
    code: '23-098',
    name: 'Lakeside Retail Pad B',
    status: 'closed',
    manager: 'Luis Ortega',
    startDate: '2025-06-16',
    budget: 2_150_000,
    committed: 2_150_000,
    actual: 2_087_000,
    lines: [
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 520_000,
        committed: 520_000,
        actual: 514_000,
      },
      {
        costCode: '06-100',
        description: 'Rough carpentry',
        budget: 610_000,
        committed: 610_000,
        actual: 598_000,
      },
      {
        costCode: '16-100',
        description: 'Electrical',
        budget: 430_000,
        committed: 430_000,
        actual: 419_000,
      },
    ],
  },

  // Harbor Development (4)
  {
    id: 'p-hd-201',
    entityId: 'harbor',
    code: 'HD-2401',
    name: 'Pier 12 Mixed-Use Tower',
    status: 'active',
    manager: 'Sofia Marchetti',
    startDate: '2026-01-05',
    budget: 24_500_000,
    committed: 15_230_000,
    actual: 9_870_000,
    lines: [
      {
        costCode: '02-250',
        description: 'Marine foundations',
        budget: 4_800_000,
        committed: 4_650_000,
        actual: 4_320_000,
      },
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 6_900_000,
        committed: 5_210_000,
        actual: 3_480_000,
      },
      {
        costCode: '05-100',
        description: 'Structural steel',
        budget: 5_400_000,
        committed: 3_260_000,
        actual: 1_540_000,
      },
      {
        costCode: '14-200',
        description: 'Elevators',
        budget: 2_100_000,
        committed: 1_180_000,
        actual: 320_000,
      },
    ],
  },
  {
    id: 'p-hd-202',
    entityId: 'harbor',
    code: 'HD-2402',
    name: 'Waterfront Promenade Improvements',
    status: 'active',
    manager: 'Marcus Boyd',
    startDate: '2026-03-23',
    budget: 4_100_000,
    committed: 2_310_000,
    actual: 1_265_000,
    lines: [
      {
        costCode: '02-800',
        description: 'Site improvements',
        budget: 1_850_000,
        committed: 1_240_000,
        actual: 830_000,
      },
      {
        costCode: '03-350',
        description: 'Architectural concrete',
        budget: 960_000,
        committed: 620_000,
        actual: 305_000,
      },
      {
        costCode: '16-500',
        description: 'Exterior lighting',
        budget: 540_000,
        committed: 285_000,
        actual: 130_000,
      },
    ],
  },
  {
    id: 'p-hd-203',
    entityId: 'harbor',
    code: 'HD-2501',
    name: 'Bayview Logistics Warehouse',
    status: 'active',
    manager: 'Sofia Marchetti',
    startDate: '2026-05-11',
    budget: 9_300_000,
    committed: 3_140_000,
    actual: 980_000,
    lines: [
      {
        costCode: '02-200',
        description: 'Sitework & excavation',
        budget: 1_150_000,
        committed: 1_090_000,
        actual: 640_000,
      },
      {
        costCode: '03-300',
        description: 'Cast-in-place concrete',
        budget: 2_700_000,
        committed: 1_320_000,
        actual: 340_000,
      },
      {
        costCode: '13-125',
        description: 'Pre-engineered metal building',
        budget: 3_400_000,
        committed: 730_000,
        actual: 0,
      },
    ],
  },
  {
    id: 'p-hd-204',
    entityId: 'harbor',
    code: 'HD-2302',
    name: 'Gate District Streetscape',
    status: 'closed',
    manager: 'Marcus Boyd',
    startDate: '2025-04-07',
    budget: 1_750_000,
    committed: 1_750_000,
    actual: 1_712_000,
    lines: [
      {
        costCode: '02-800',
        description: 'Site improvements',
        budget: 1_050_000,
        committed: 1_050_000,
        actual: 1_034_000,
      },
      {
        costCode: '16-500',
        description: 'Exterior lighting',
        budget: 700_000,
        committed: 700_000,
        actual: 678_000,
      },
    ],
  },

  // Northpoint Builders (2, sparse)
  {
    id: 'p-np-301',
    entityId: 'northpoint',
    code: 'NP-001',
    name: 'Summit Trailhead Visitor Center',
    status: 'active',
    manager: 'Erin Kowalski',
    startDate: '2026-06-01',
    budget: 2_900_000,
    committed: 760_000,
    actual: 214_000,
    lines: [
      {
        costCode: '02-200',
        description: 'Sitework & excavation',
        budget: 380_000,
        committed: 340_000,
        actual: 190_000,
      },
      {
        costCode: '06-100',
        description: 'Rough carpentry',
        budget: 780_000,
        committed: 420_000,
        actual: 24_000,
      },
    ],
  },
  {
    id: 'p-np-302',
    entityId: 'northpoint',
    code: 'NP-002',
    name: 'Alder Creek Bridge Repair',
    status: 'on-hold',
    manager: 'Erin Kowalski',
    startDate: '2026-07-06',
    budget: 1_150_000,
    committed: 90_000,
    actual: 0,
    lines: [
      {
        costCode: '02-450',
        description: 'Bridge demolition',
        budget: 210_000,
        committed: 90_000,
        actual: 0,
      },
    ],
  },
];

const invoices: Invoice[] = [
  // Silverstone (10)
  {
    id: 'inv-sc-1001',
    entityId: 'silverstone',
    projectId: 'p-sc-101',
    number: 'AP-1001',
    vendor: 'Bedrock Excavating Co',
    issuedDate: '2026-06-30',
    dueDate: '2026-07-30',
    amount: 148_200,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '02-200',
        description: 'Mass excavation, June progress',
        amount: 121_500,
      },
      {
        id: 'l2',
        costCode: '02-200',
        description: 'Haul-off & disposal',
        amount: 26_700,
      },
    ],
  },
  {
    id: 'inv-sc-1002',
    entityId: 'silverstone',
    projectId: 'p-sc-101',
    number: 'AP-1002',
    vendor: 'Cascade Steel Fabricators',
    issuedDate: '2026-07-08',
    dueDate: '2026-08-07',
    amount: 402_750,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '05-100',
        description: 'Steel erection, sequence 3',
        amount: 356_250,
      },
      {
        id: 'l2',
        costCode: '05-100',
        description: 'Field welding & touch-up',
        amount: 46_500,
      },
    ],
  },
  {
    id: 'inv-sc-1003',
    entityId: 'silverstone',
    projectId: 'p-sc-101',
    number: 'AP-1003',
    vendor: 'Summit Plumbing Inc',
    issuedDate: '2026-07-15',
    dueDate: '2026-08-14',
    amount: 86_400,
    status: 'approved',
    lines: [
      {
        id: 'l1',
        costCode: '15-400',
        description: 'Underground rough-in, level 1',
        amount: 64_800,
      },
      {
        id: 'l2',
        costCode: '15-400',
        description: 'Fixture package deposit',
        amount: 21_600,
      },
    ],
  },
  {
    id: 'inv-sc-1004',
    entityId: 'silverstone',
    projectId: 'p-sc-102',
    number: 'AP-1004',
    vendor: 'Pinnacle Concrete Pumping',
    issuedDate: '2026-07-02',
    dueDate: '2026-08-01',
    amount: 238_900,
    status: 'approved',
    lines: [
      {
        id: 'l1',
        costCode: '03-300',
        description: 'Deck pour, level 3',
        amount: 182_400,
      },
      {
        id: 'l2',
        costCode: '03-300',
        description: 'Column pours, grid A-D',
        amount: 41_300,
      },
      {
        id: 'l3',
        costCode: '03-300',
        description: 'Winter protection',
        amount: 15_200,
      },
    ],
  },
  {
    id: 'inv-sc-1005',
    entityId: 'silverstone',
    projectId: 'p-sc-102',
    number: 'AP-1005',
    vendor: 'Ironline Metalworks',
    issuedDate: '2026-07-21',
    dueDate: '2026-08-20',
    amount: 57_150,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '05-500',
        description: 'Stair rail fabrication',
        amount: 38_900,
      },
      {
        id: 'l2',
        costCode: '05-500',
        description: 'Bollards & misc metals',
        amount: 18_250,
      },
    ],
  },
  {
    id: 'inv-sc-1006',
    entityId: 'silverstone',
    projectId: 'p-sc-103',
    number: 'AP-1006',
    vendor: 'Bedrock Excavating Co',
    issuedDate: '2026-06-12',
    dueDate: '2026-07-12',
    amount: 312_000,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '02-200',
        description: 'Site grading, phase II pads',
        amount: 265_000,
      },
      {
        id: 'l2',
        costCode: '02-200',
        description: 'Erosion control',
        amount: 47_000,
      },
    ],
  },
  {
    id: 'inv-sc-1007',
    entityId: 'silverstone',
    projectId: 'p-sc-103',
    number: 'AP-1007',
    vendor: 'Timberline Framing LLC',
    issuedDate: '2026-07-19',
    dueDate: '2026-08-18',
    amount: 176_500,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '06-100',
        description: 'Building A wall framing',
        amount: 132_000,
      },
      {
        id: 'l2',
        costCode: '06-100',
        description: 'Floor sheathing, building A',
        amount: 44_500,
      },
    ],
  },
  {
    id: 'inv-sc-1008',
    entityId: 'silverstone',
    projectId: 'p-sc-104',
    number: 'AP-1008',
    vendor: 'Metro Demolition Services',
    issuedDate: '2026-05-28',
    dueDate: '2026-06-27',
    amount: 94_600,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '02-050',
        description: 'Interior demo, wings B & C',
        amount: 78_200,
      },
      {
        id: 'l2',
        costCode: '02-050',
        description: 'Abatement monitoring',
        amount: 16_400,
      },
    ],
  },
  {
    id: 'inv-sc-1009',
    entityId: 'silverstone',
    projectId: 'p-sc-104',
    number: 'AP-1009',
    vendor: 'Airflow Mechanical',
    issuedDate: '2026-07-25',
    dueDate: '2026-08-24',
    amount: 41_300,
    status: 'draft',
    lines: [
      {
        id: 'l1',
        costCode: '15-800',
        description: 'RTU submittal engineering',
        amount: 28_800,
      },
      {
        id: 'l2',
        costCode: '15-800',
        description: 'Ductwork shop drawings',
        amount: 12_500,
      },
    ],
  },
  {
    id: 'inv-sc-1010',
    entityId: 'silverstone',
    projectId: 'p-sc-105',
    number: 'AP-1010',
    vendor: 'Volt Electric Co',
    issuedDate: '2026-06-05',
    dueDate: '2026-07-05',
    amount: 18_750,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '16-100',
        description: 'Punch-list corrections',
        amount: 12_250,
      },
      {
        id: 'l2',
        costCode: '16-100',
        description: 'As-built documentation',
        amount: 6_500,
      },
    ],
  },

  // Harbor (8)
  {
    id: 'inv-hd-2001',
    entityId: 'harbor',
    projectId: 'p-hd-201',
    number: 'AP-2001',
    vendor: 'Deepwater Marine Construction',
    issuedDate: '2026-06-20',
    dueDate: '2026-07-20',
    amount: 1_240_000,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '02-250',
        description: 'Pile driving, June progress',
        amount: 1_045_000,
      },
      {
        id: 'l2',
        costCode: '02-250',
        description: 'Marine survey & layout',
        amount: 195_000,
      },
    ],
  },
  {
    id: 'inv-hd-2002',
    entityId: 'harbor',
    projectId: 'p-hd-201',
    number: 'AP-2002',
    vendor: 'Pacific Concrete Group',
    issuedDate: '2026-07-10',
    dueDate: '2026-08-09',
    amount: 684_500,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '03-300',
        description: 'Core walls, levels 4-6',
        amount: 512_000,
      },
      {
        id: 'l2',
        costCode: '03-300',
        description: 'Post-tension deck, level 5',
        amount: 172_500,
      },
    ],
  },
  {
    id: 'inv-hd-2003',
    entityId: 'harbor',
    projectId: 'p-hd-201',
    number: 'AP-2003',
    vendor: 'Vertex Elevator Systems',
    issuedDate: '2026-07-18',
    dueDate: '2026-08-17',
    amount: 320_000,
    status: 'approved',
    lines: [
      {
        id: 'l1',
        costCode: '14-200',
        description: 'Elevator equipment deposit',
        amount: 320_000,
      },
    ],
  },
  {
    id: 'inv-hd-2004',
    entityId: 'harbor',
    projectId: 'p-hd-202',
    number: 'AP-2004',
    vendor: 'Shoreline Landscapes',
    issuedDate: '2026-07-01',
    dueDate: '2026-07-31',
    amount: 128_300,
    status: 'approved',
    lines: [
      {
        id: 'l1',
        costCode: '02-800',
        description: 'Promenade pavers, section 2',
        amount: 96_800,
      },
      {
        id: 'l2',
        costCode: '02-800',
        description: 'Irrigation rough-in',
        amount: 31_500,
      },
    ],
  },
  {
    id: 'inv-hd-2005',
    entityId: 'harbor',
    projectId: 'p-hd-202',
    number: 'AP-2005',
    vendor: 'Lumen Outdoor Lighting',
    issuedDate: '2026-07-22',
    dueDate: '2026-08-21',
    amount: 64_900,
    status: 'draft',
    lines: [
      {
        id: 'l1',
        costCode: '16-500',
        description: 'Pole light fixtures, phase 1',
        amount: 52_400,
      },
      {
        id: 'l2',
        costCode: '16-500',
        description: 'Conduit & wire',
        amount: 12_500,
      },
    ],
  },
  {
    id: 'inv-hd-2006',
    entityId: 'harbor',
    projectId: 'p-hd-203',
    number: 'AP-2006',
    vendor: 'Bayside Earthworks',
    issuedDate: '2026-06-27',
    dueDate: '2026-07-27',
    amount: 402_600,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '02-200',
        description: 'Building pad cut & fill',
        amount: 341_000,
      },
      {
        id: 'l2',
        costCode: '02-200',
        description: 'Storm detention excavation',
        amount: 61_600,
      },
    ],
  },
  {
    id: 'inv-hd-2007',
    entityId: 'harbor',
    projectId: 'p-hd-203',
    number: 'AP-2007',
    vendor: 'Pacific Concrete Group',
    issuedDate: '2026-07-24',
    dueDate: '2026-08-23',
    amount: 218_400,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '03-300',
        description: 'Foundations, grid 1-8',
        amount: 176_900,
      },
      {
        id: 'l2',
        costCode: '03-300',
        description: 'Slab-on-grade prep',
        amount: 41_500,
      },
    ],
  },
  {
    id: 'inv-hd-2008',
    entityId: 'harbor',
    projectId: 'p-hd-204',
    number: 'AP-2008',
    vendor: 'Lumen Outdoor Lighting',
    issuedDate: '2026-05-30',
    dueDate: '2026-06-29',
    amount: 22_100,
    status: 'paid',
    lines: [
      {
        id: 'l1',
        costCode: '16-500',
        description: 'Warranty replacements',
        amount: 14_600,
      },
      {
        id: 'l2',
        costCode: '16-500',
        description: 'Final commissioning',
        amount: 7_500,
      },
    ],
  },

  // Northpoint (3, sparse)
  {
    id: 'inv-np-3001',
    entityId: 'northpoint',
    projectId: 'p-np-301',
    number: 'AP-3001',
    vendor: 'High Country Excavation',
    issuedDate: '2026-07-06',
    dueDate: '2026-08-05',
    amount: 118_400,
    status: 'approved',
    lines: [
      {
        id: 'l1',
        costCode: '02-200',
        description: 'Access road & pad grading',
        amount: 98_400,
      },
      {
        id: 'l2',
        costCode: '02-200',
        description: 'Rock removal',
        amount: 20_000,
      },
    ],
  },
  {
    id: 'inv-np-3002',
    entityId: 'northpoint',
    projectId: 'p-np-301',
    number: 'AP-3002',
    vendor: 'Alpine Timberworks',
    issuedDate: '2026-07-26',
    dueDate: '2026-08-25',
    amount: 24_000,
    status: 'pending-approval',
    lines: [
      {
        id: 'l1',
        costCode: '06-100',
        description: 'Glulam beam deposit',
        amount: 24_000,
      },
    ],
  },
  {
    id: 'inv-np-3003',
    entityId: 'northpoint',
    projectId: 'p-np-302',
    number: 'AP-3003',
    vendor: 'Cascade Bridge Services',
    issuedDate: '2026-07-28',
    dueDate: '2026-08-27',
    amount: 9_800,
    status: 'draft',
    lines: [
      {
        id: 'l1',
        costCode: '02-450',
        description: 'Traffic control plan',
        amount: 9_800,
      },
    ],
  },
];

const inboxItems: InboxItem[] = [
  // Silverstone (6)
  {
    id: 'ib-sc-1',
    entityId: 'silverstone',
    projectId: 'p-sc-101',
    type: 'approval',
    title: 'Approve invoice AP-1002 — Cascade Steel Fabricators',
    detail: '$402,750.00 against 24-101 Riverview Medical Office Building',
    due: '2026-08-04',
    ref: { kind: 'invoice', id: 'inv-sc-1002' },
  },
  {
    id: 'ib-sc-2',
    entityId: 'silverstone',
    projectId: 'p-sc-102',
    type: 'approval',
    title: 'Approve invoice AP-1005 — Ironline Metalworks',
    detail: '$57,150.00 against 24-102 Maple Street Parking Structure',
    due: '2026-08-06',
    ref: { kind: 'invoice', id: 'inv-sc-1005' },
  },
  {
    id: 'ib-sc-3',
    entityId: 'silverstone',
    projectId: 'p-sc-103',
    type: 'approval',
    title: 'Approve invoice AP-1007 — Timberline Framing LLC',
    detail: '$176,500.00 against 25-103 Cedar Ridge Apartments Phase II',
    due: '2026-08-08',
    ref: { kind: 'invoice', id: 'inv-sc-1007' },
  },
  {
    id: 'ib-sc-4',
    entityId: 'silverstone',
    projectId: 'p-sc-104',
    type: 'task',
    title: 'Review hold status — Fairground Elementary Renovation',
    detail: 'District funding decision expected this week; confirm resume date',
    due: '2026-08-07',
    ref: { kind: 'project', id: 'p-sc-104' },
  },
  {
    id: 'ib-sc-5',
    entityId: 'silverstone',
    projectId: 'p-sc-101',
    type: 'task',
    title: 'Budget check: structural steel committed at 94%',
    detail: '24-101 cost code 05-100 nearing committed budget',
    ref: { kind: 'project', id: 'p-sc-101' },
  },
  {
    id: 'ib-sc-6',
    entityId: 'silverstone',
    projectId: 'p-sc-104',
    type: 'approval',
    title: 'Submit draft AP-1009 — Airflow Mechanical',
    detail: '$41,300.00 draft awaiting coding review',
    due: '2026-08-11',
    ref: { kind: 'invoice', id: 'inv-sc-1009' },
  },

  // Harbor (4)
  {
    id: 'ib-hd-1',
    entityId: 'harbor',
    projectId: 'p-hd-201',
    type: 'approval',
    title: 'Approve invoice AP-2002 — Pacific Concrete Group',
    detail: '$684,500.00 against HD-2401 Pier 12 Mixed-Use Tower',
    due: '2026-08-03',
    ref: { kind: 'invoice', id: 'inv-hd-2002' },
  },
  {
    id: 'ib-hd-2',
    entityId: 'harbor',
    projectId: 'p-hd-203',
    type: 'approval',
    title: 'Approve invoice AP-2007 — Pacific Concrete Group',
    detail: '$218,400.00 against HD-2501 Bayview Logistics Warehouse',
    due: '2026-08-10',
    ref: { kind: 'invoice', id: 'inv-hd-2007' },
  },
  {
    id: 'ib-hd-3',
    entityId: 'harbor',
    projectId: 'p-hd-202',
    type: 'task',
    title: 'Code draft AP-2005 — Lumen Outdoor Lighting',
    detail: 'Fixture package needs cost codes before submission',
    due: '2026-08-05',
    ref: { kind: 'invoice', id: 'inv-hd-2005' },
  },
  {
    id: 'ib-hd-4',
    entityId: 'harbor',
    projectId: 'p-hd-201',
    type: 'task',
    title: 'Elevator submittal review — Pier 12',
    detail: 'Vertex shop drawings due back to vendor Friday',
    due: '2026-08-07',
    ref: { kind: 'project', id: 'p-hd-201' },
  },

  // Northpoint (2)
  {
    id: 'ib-np-1',
    entityId: 'northpoint',
    projectId: 'p-np-301',
    type: 'approval',
    title: 'Approve invoice AP-3002 — Alpine Timberworks',
    detail: '$24,000.00 against NP-001 Summit Trailhead Visitor Center',
    due: '2026-08-09',
    ref: { kind: 'invoice', id: 'inv-np-3002' },
  },
  {
    id: 'ib-np-2',
    entityId: 'northpoint',
    projectId: 'p-np-302',
    type: 'task',
    title: 'Confirm detour permit — Alder Creek Bridge Repair',
    detail: 'County permit required before demolition can be scheduled',
    due: '2026-08-14',
    ref: { kind: 'project', id: 'p-np-302' },
  },
];

// Selectors — the seam a future API client replaces. Pages call these and
// never import the seed arrays directly.

export function getEntities(): Entity[] {
  return entities;
}

export function getEntity(id: string): Entity | undefined {
  return entities.find(e => e.id === id);
}

export function getProjects(entityId: string): Project[] {
  return projects.filter(p => p.entityId === entityId);
}

export function getProject(entityId: string, id: string): Project | undefined {
  return projects.find(p => p.entityId === entityId && p.id === id);
}

export function getInvoices(entityId: string, projectId?: string): Invoice[] {
  return invoices.filter(
    i => i.entityId === entityId && (!projectId || i.projectId === projectId)
  );
}

export function getInvoice(entityId: string, id: string): Invoice | undefined {
  return invoices.find(i => i.entityId === entityId && i.id === id);
}

export function getInboxItems(
  entityId: string,
  projectId?: string
): InboxItem[] {
  return inboxItems.filter(
    i => i.entityId === entityId && (!projectId || i.projectId === projectId)
  );
}
