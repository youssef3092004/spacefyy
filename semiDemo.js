/**
 * 🎮 Semi-Demo Data Generator
 * Generates comprehensive demo data for testing:
 * - 1 Business
 * - 3 Branches
 * - Multiple Spaces per Branch
 * - Multiple Devices per Branch
 * - Multiple Tools per Branch
 * All with proper relationships
 */

const semiDemoData = {
  // Owner credentials
  credentials: {
    email: "ownerTest@gmail.com",
    password: "asdf123456789",
  },

  // Main Business with fake UUID format IDs
  business: {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Premium Gaming Hub",
    ownerId: "99999999-9999-9999-9999-999999999999", // Reference to owner
    planId: "88888888-8888-8888-8888-888888888888", // Reference to plan
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date(),
  },

  // Business Settings
  businessSettings: {
    id: "77777777-7777-7777-7777-777777777777",
    businessId: "11111111-1111-1111-1111-111111111111",
    defaultLanguage: "EN",
    notificationsEnabled: true,
    autoApprovePayroll: false,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date(),
  },

  // Storage Usage Tracking
  storageUsage: {
    id: "66666666-6666-6666-6666-666666666666",
    businessId: "11111111-1111-1111-1111-111111111111",
    currentBranches: 3,
    currentSpaces: 12,
    currentDevices: 25,
    currentTools: 30,
    currentStaff: 15,
    currentUsers: 50,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date(),
  },

  // 3 Branches
  branches: [
    {
      id: "22222222-2222-2222-2222-222222222221",
      businessId: "11111111-1111-1111-1111-111111111111",
      name: "Downtown Gaming Center",
      address: "123 Main Street, Downtown",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      isActive: true,
      openingTime: "09:00",
      closingTime: "23:00",
      createdAt: new Date("2024-01-16"),
      updatedAt: new Date(),
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      businessId: "11111111-1111-1111-1111-111111111111",
      name: "Mall Gaming Lounge",
      address: "456 Shopping Mall, Level 3",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      isActive: true,
      openingTime: "10:00",
      closingTime: "22:00",
      createdAt: new Date("2024-01-17"),
      updatedAt: new Date(),
    },
    {
      id: "22222222-2222-2222-2222-222222222223",
      businessId: "11111111-1111-1111-1111-111111111111",
      name: "Airport Gaming Hub",
      address: "789 Airport Terminal 2",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      isActive: true,
      openingTime: "06:00",
      closingTime: "00:00",
      createdAt: new Date("2024-01-18"),
      updatedAt: new Date(),
    },
  ],

  // Spaces for Branches
  spaces: [
    // Downtown Branch Spaces
    {
      id: "33333333-3333-3333-3333-333333333331",
      branchId: "22222222-2222-2222-2222-222222222221",
      name: "VIP Gaming Room 1",
      type: "VIP",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 8,
      availableNumber: 2,
      priceType: "PER_HOUR",
      price: 150.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-19"),
      updatedAt: new Date(),
    },
    {
      id: "33333333-3333-3333-3333-333333333332",
      branchId: "22222222-2222-2222-2222-222222222221",
      name: "Public Gaming Zone",
      type: "PUBLIC",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 20,
      availableNumber: 5,
      priceType: "PER_HOUR",
      price: 50.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-19"),
      updatedAt: new Date(),
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      branchId: "22222222-2222-2222-2222-222222222221",
      name: "Tournament Arena",
      type: "MEETING",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 50,
      availableNumber: 1,
      priceType: "PER_SESSION",
      price: 500.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-19"),
      updatedAt: new Date(),
    },

    // Mall Branch Spaces
    {
      id: "33333333-3333-3333-3333-333333333334",
      branchId: "22222222-2222-2222-2222-222222222222",
      name: "Casual Gaming Desk",
      type: "DESK",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 1,
      availableNumber: 5,
      priceType: "PER_HOUR",
      price: 25.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-20"),
      updatedAt: new Date(),
    },
    {
      id: "33333333-3333-3333-3333-333333333335",
      branchId: "22222222-2222-2222-2222-222222222222",
      name: "Private Lounge",
      type: "PRIVATE",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 4,
      availableNumber: 2,
      priceType: "PER_HOUR",
      price: 100.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-20"),
      updatedAt: new Date(),
    },

    // Airport Branch Spaces
    {
      id: "33333333-3333-3333-3333-333333333336",
      branchId: "22222222-2222-2222-2222-222222222223",
      name: "Quick Gaming Pod",
      type: "DESK",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      capacity: 1,
      availableNumber: 8,
      priceType: "PER_HOUR",
      price: 30.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-21"),
      updatedAt: new Date(),
    },
  ],

  // Devices for Branches
  devices: [
    // Downtown Branch Devices
    {
      id: "44444444-4444-4444-4444-444444444441",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      name: "PS5 Console 1",
      type: "PS5_4",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 80.0,
      SGLPS: 60.0,
      DBLPS: 100.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444442",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      name: "PS5 Console 2",
      type: "PS5_4",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 80.0,
      SGLPS: 60.0,
      DBLPS: 100.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444443",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333332",
      name: "Gaming PC Rig 1",
      type: "PC",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 40.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333332",
      name: "Gaming PC Rig 2",
      type: "PC",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 40.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444445",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333332",
      name: "VR Headset Arena",
      type: "VR_HEADSET",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 50.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444446",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: null,
      name: "Projector System",
      type: "PROJECTOR",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 25.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-22"),
      updatedAt: new Date(),
    },

    // Mall Branch Devices
    {
      id: "44444444-4444-4444-4444-444444444447",
      branchId: "22222222-2222-2222-2222-222222222222",
      spaceId: "33333333-3333-3333-3333-333333333334",
      name: "Gaming Laptop 1",
      type: "LAPTOP",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 35.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-23"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444448",
      branchId: "22222222-2222-2222-2222-222222222222",
      spaceId: "33333333-3333-3333-3333-333333333335",
      name: "PS4 Console",
      type: "PS4_4",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 55.0,
      SGLPS: 40.0,
      DBLPS: 75.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-23"),
      updatedAt: new Date(),
    },

    // Airport Branch Devices
    {
      id: "44444444-4444-4444-4444-444444444449",
      branchId: "22222222-2222-2222-2222-222222222223",
      spaceId: "33333333-3333-3333-3333-333333333336",
      name: "Nintendo Switch 1",
      type: "NINTENDO_SWITCH",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 20.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-24"),
      updatedAt: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444450",
      branchId: "22222222-2222-2222-2222-222222222223",
      spaceId: "33333333-3333-3333-3333-333333333336",
      name: "Tablet Gaming Station",
      type: "TABLET",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_HOUR",
      price: 15.0,
      isActive: true,
      isBusy: false,
      createdAt: new Date("2024-01-24"),
      updatedAt: new Date(),
    },
  ],

  // Tools for Branches
  tools: [
    // Downtown Branch Tools
    {
      id: "55555555-5555-5555-5555-555555555551",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      deviceId: "44444444-4444-4444-4444-444444444441",
      name: "PS5 Controller Set 1",
      type: "CONTROLLER",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 10.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555552",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      deviceId: "44444444-4444-4444-4444-444444444442",
      name: "PS5 Controller Set 2",
      type: "CONTROLLER",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 10.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555553",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      deviceId: null,
      name: "Racing Steering Wheel",
      type: "STEERING_WHEEL",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 25.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555554",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333331",
      deviceId: null,
      name: "Pedals & Shifter Set",
      type: "PEDALS",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 20.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333332",
      deviceId: null,
      name: "Gaming Headset Fox",
      type: "HEADSET",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 8.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555556",
      branchId: "22222222-2222-2222-2222-222222222221",
      spaceId: "33333333-3333-3333-3333-333333333333",
      deviceId: null,
      name: "Ping Pong Table",
      type: "PING_PONG",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 15.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-25"),
      updatedAt: new Date(),
    },

    // Mall Branch Tools
    {
      id: "55555555-5555-5555-5555-555555555557",
      branchId: "22222222-2222-2222-2222-222222222222",
      spaceId: "33333333-3333-3333-3333-333333333335",
      deviceId: "44444444-4444-4444-4444-444444444448",
      name: "PS4 Controller Set",
      type: "CONTROLLER",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 8.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-26"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555558",
      branchId: "22222222-2222-2222-2222-222222222222",
      spaceId: "33333333-3333-3333-3333-333333333335",
      deviceId: null,
      name: "Board Games Bundle",
      type: "BOARD_GAME",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 5.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-26"),
      updatedAt: new Date(),
    },

    // Airport Branch Tools
    {
      id: "55555555-5555-5555-5555-555555555559",
      branchId: "22222222-2222-2222-2222-222222222223",
      spaceId: "33333333-3333-3333-3333-333333333336",
      deviceId: "44444444-4444-4444-4444-444444444449",
      name: "Nintendo Joy-Con Set",
      type: "CONTROLLER",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 6.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-27"),
      updatedAt: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555560",
      branchId: "22222222-2222-2222-2222-222222222223",
      spaceId: "33333333-3333-3333-3333-333333333336",
      deviceId: null,
      name: "Billiardo Ball Set",
      type: "BILLIARDO",
      image:
        "https://media.istockphoto.com/id/1472933890/vector/no-image-vector.jpg",
      priceType: "PER_SESSION",
      price: 12.0,
      isActive: true,
      isBusy: false,
      createdBy: "99999999-9999-9999-9999-999999999999",
      updatedBy: "99999999-9999-9999-9999-999999999999",
      createdAt: new Date("2024-01-27"),
      updatedAt: new Date(),
    },
  ],

  // Pricing Rules for better organization
  pricingRules: [
    // VIP Space Pricing
    {
      id: "77777777-7777-7777-7777-777777777751",
      branchId: "22222222-2222-2222-2222-222222222221",
      name: "VIP Room Peak Hours",
      pricingType: "PER_HOUR",
      minDurationMinutes: 60,
      maxDurationMinutes: 240,
      minPlayers: 2,
      maxPlayers: 8,
      price: 150.0,
      currency: "EGP",
      priority: 1,
      isActive: true,
      pricingMode: "TIME_RANGE",
      spaceId: "33333333-3333-3333-3333-333333333331",
      deviceId: null,
      toolId: null,
      createdAt: new Date("2024-01-28"),
      updatedAt: new Date(),
    },
    // PS5 Device Pricing
    {
      id: "77777777-7777-7777-7777-777777777752",
      branchId: "22222222-2222-2222-2222-222222222221",
      name: "PS5 Console Standard",
      pricingType: "PER_HOUR",
      minDurationMinutes: 30,
      minPlayers: 1,
      maxPlayers: 4,
      price: 80.0,
      currency: "EGP",
      priority: 5,
      isActive: true,
      pricingMode: "PER_HOUR",
      spaceId: null,
      deviceId: "44444444-4444-4444-4444-444444444441",
      toolId: null,
      createdAt: new Date("2024-01-28"),
      updatedAt: new Date(),
    },
  ],

  // Summary Statistics
  summary: {
    businessCount: 1,
    branchCount: 3,
    spaceCount: 7,
    deviceCount: 10,
    toolCount: 10,
    pricingRulesCount: 2,
    totalRelationships: "All entities linked through branchId/businessId",
  },
};

// Export for use in other files or as seed data
if (typeof module !== "undefined" && module.exports) {
  module.exports = semiDemoData;
}

// Display the data structure
console.log("=".repeat(60));
console.log("🎮 SEMI-DEMO DATA STRUCTURE");
console.log("=".repeat(60));
console.log("\n📧 Owner Credentials:");
console.log(`   Email: ${semiDemoData.credentials.email}`);
console.log(`   Password: ${semiDemoData.credentials.password}`);

console.log("\n🏢 Business Information:");
console.log(`   ID: ${semiDemoData.business.id}`);
console.log(`   Name: ${semiDemoData.business.name}`);

console.log("\n📊 Data Summary:");
console.log(`   Branches: ${semiDemoData.summary.branchCount}`);
console.log(`   Spaces: ${semiDemoData.summary.spaceCount}`);
console.log(`   Devices: ${semiDemoData.summary.deviceCount}`);
console.log(`   Tools: ${semiDemoData.summary.toolCount}`);
console.log(`   Pricing Rules: ${semiDemoData.summary.pricingRulesCount}`);

console.log("\n🔗 Relationships:");
semiDemoData.branches.forEach((branch) => {
  const spaces = semiDemoData.spaces.filter((s) => s.branchId === branch.id);
  const devices = semiDemoData.devices.filter((d) => d.branchId === branch.id);
  const tools = semiDemoData.tools.filter((t) => t.branchId === branch.id);

  console.log(`\n   ${branch.name}`);
  console.log(`      ├─ Spaces: ${spaces.length}`);
  console.log(`      ├─ Devices: ${devices.length}`);
  console.log(`      └─ Tools: ${tools.length}`);
});

console.log("\n" + "=".repeat(60));
console.log("✅ All data is properly related through IDs");
console.log("=".repeat(60));
