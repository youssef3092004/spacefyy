# Spacefyy Project Description

Spacefyy is a multi-tenant backend API for managing business operations across branches and spaces. It is built with Express, Prisma, PostgreSQL, and Redis, and it includes security and operational middleware for authentication, authorization, request sanitization, caching, and background jobs.

## What It Does

The API supports business workflows such as user and role management, permission-based access control, branch administration, staff profiles, payroll, customers, visits, sessions, products, categories, orders, order items, and invoices. It also manages spaces, devices, equipment, pricing rules, resource pricing, plans, and storage usage tracking.

## Main Areas

- Authentication and RBAC for users, roles, permissions, and branch-level access.
- Business and branch management for multi-location operations.
- Resource management for spaces, devices, units, and equipment.
- Commercial workflows for customers, visits, sessions, products, orders, and invoices.
- Pricing and subscription support through pricing rules, resource pricing, plans, and storage usage.
- Background automation for branch statistics and storage usage updates.

## Platform Notes

- `server.js` boots the API, connects to the database and Redis, and starts cron jobs.
- The service exposes versioned routes under `/api/v1`.
- Security middleware includes `helmet`, `cors`, XSS sanitization, request size limits, and centralized error handling.

## Short Summary

Spacefyy is a backend system for running branch-based businesses with strong access control, operational tracking, and billing-related workflows in one API.
