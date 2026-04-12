# MuGina Ticketing API — Architecture Guide

This document explains how the NestJS backend is structured, how its pieces connect, and how a real request travels through the code from the moment it hits the server to the moment a response goes back.

---

## 1. What NestJS is (the short version)

NestJS is a Node.js framework that organises your code into **modules**. Each module is a self-contained box that declares:

- **Controllers** — classes that receive HTTP requests and return responses
- **Services** — classes that contain business logic
- **Providers** — anything else that can be injected (repositories, guards, strategies, etc.)

The glue between all of these is **Dependency Injection (DI)**. Instead of calling `new SomeService()` yourself, you declare what you need in a constructor and NestJS wires it up automatically at startup. This is why every class you will see has a constructor whose arguments are other services.

---

## 2. The Four-Layer Architecture

The codebase is split into four directories inside `src/`. Each layer has a strict rule about who it can depend on.

```
src/
├── domain/           ← layer 1: the rules of the business
├── application/      ← layer 2: the use-case logic
├── infrastructure/   ← layer 3: databases, caches, external APIs
└── presentation/     ← layer 4: HTTP — controllers, guards, decorators
```

The dependency rule flows **inward only**:

```
presentation  →  application  →  domain
infrastructure            →  domain
```

`domain` never imports from any other layer. `application` never imports from `presentation` or `infrastructure` directly — it only talks to `domain` interfaces. This means you could swap Postgres for a different database by changing only the infrastructure layer.

---

## 3. Layer-by-layer breakdown

### Layer 1 — `domain/`

This is the heart of the system. It contains:

- **Entities** — plain TypeScript classes that represent business objects (`UserEntity`, `OrderEntity`, `TicketEntity`, etc.)
- **Repository interfaces** — TypeScript `interface` definitions that describe what data operations are available, without saying *how* they work

Example — `src/domain/user/repositories/user.repository.interface.ts`:
```ts
export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  create(data: Partial<UserEntity>): Promise<UserEntity>;
  update(id: string, data: Partial<UserEntity>): Promise<UserEntity>;
}

// A Symbol used as the DI token so NestJS knows what to inject
export const USER_REPOSITORY = Symbol('IUserRepository');
```

The domain layer never mentions Prisma, Redis, or HTTP. It is pure business.

---

### Layer 2 — `application/`

This is where **use cases live**. Each service here orchestrates a business action:

| Service | What it does |
|---|---|
| `AuthService` | Register, login, hash passwords, sign JWTs |
| `EventsService` | Create/update/delete events, add ticket types |
| `OrdersService` | Create an order, calculate totals, call Paystack |
| `TicketsService` | Generate QR codes, validate tickets, manage cache |
| `PaymentsService` | Handle Paystack webhook, trigger ticket generation |

Services **only depend on domain interfaces and other application services**. They never import `PrismaService` or `ioredis` directly — they talk to repositories through the interfaces defined in `domain/`.

Example — `AuthService` constructor (`src/application/auth/auth.service.ts`):
```ts
constructor(
  @Inject(USER_REPOSITORY)          // ← NestJS looks up what's registered for this Symbol
  private readonly userRepo: IUserRepository,
  private readonly jwtService: JwtService,
  private readonly config: ConfigService,
) {}
```

`@Inject(USER_REPOSITORY)` tells NestJS: *"inject whatever was registered for the `USER_REPOSITORY` token."* The service doesn't know (or care) that it is actually getting `UserPrismaRepository`.

---

### Layer 3 — `infrastructure/`

This layer provides the concrete implementations of the domain interfaces and wraps external services.

**Database** (`infrastructure/database/`):

`PrismaService` (`prisma.service.ts`) extends `PrismaClient` and connects to Postgres on startup via `onModuleInit`. Every Prisma repository wraps this service.

`UserPrismaRepository` (`repositories/user.prisma.repository.ts`) implements `IUserRepository`. Its job is to translate between Prisma's raw database row and the domain's `UserEntity`:

```ts
private toEntity(raw: any): UserEntity {
  const entity = new UserEntity();
  Object.assign(entity, { ...raw, role: raw.role as UserRole });
  return entity;
}
```

This `toEntity` mapper is the boundary between the database world and the domain world.

**Redis cache** (`infrastructure/cache/`):

`RedisService` is a thin wrapper around `ioredis`.  
`TicketCacheService` sits on top of it and provides two high-level operations:
- `cacheTicketStatus(ticketId, isUsed)` — stores `{ isUsed, cachedAt }` with a 24-hour TTL
- `markTicketUsedInCache(ticketId)` — updates the cache when a ticket is scanned

**Paystack** (`infrastructure/paystack/`):

`PaystackService` makes HTTP calls to the Paystack REST API using `axios`. It has three methods: `initializeTransaction`, `verifyTransaction`, and `verifyWebhookSignature`.

**Cloudinary** (`infrastructure/cloudinary/`):

`CloudinaryService` uploads event banner images and returns a hosted URL.

---

### Layer 4 — `presentation/`

This layer faces the outside world. It contains everything HTTP-related.

**Controllers** — one per feature, route handlers only. They receive the request, call a service, and return the result. No business logic lives here.

**Guards** — run before a route handler to decide if the request is allowed:
- `JwtAuthGuard` (`guards/jwt-auth.guard.ts`) — extends NestJS's `AuthGuard('jwt')`. When applied to a route, it triggers the JWT strategy to verify the Bearer token.
- `RolesGuard` (`guards/roles.guard.ts`) — reads which roles are required for the route (set by `@Roles(...)`) and checks if the authenticated user's role matches.

**Decorators** — reusable metadata attachments:
- `@Roles('ORGANIZER')` — marks a route as requiring a specific role. The `RolesGuard` reads this.
- `@CurrentUser()` — a parameter decorator that extracts `request.user` (placed there by `JwtStrategy.validate()`) so you don't need to write `req.user` in every controller.

**Strategies** — `JwtStrategy` (`auth/strategies/jwt.strategy.ts`) decodes and validates the JWT. Once valid, its `validate()` method runs and its return value becomes `request.user`.

---

## 4. How a request flows through the code

Here is what happens, step by step, when a client sends a request. We will trace **POST `/api/v1/orders`** (create an order) as the example.

```
Client HTTP request
       │
       ▼
  main.ts  ← NestFactory starts the app, applies global middleware
  (Helmet, CORS, compression, ValidationPipe)
       │
       ▼
  ThrottlerModule  ← rate limit check (100 req / 60s globally)
       │
       ▼
  OrdersController.create()  [presentation/orders/orders.controller.ts]
  ← @UseGuards(JwtAuthGuard)
       │
       ▼
  JwtAuthGuard  ← "does this request have a valid Bearer token?"
       │
       ▼
  JwtStrategy.validate()  ← decodes JWT, loads user from DB, sets request.user
       │
       ▼
  RolesGuard  ← checks request.user.role against @Roles() metadata
       │
       ▼
  ValidationPipe  ← validates and transforms the request body against CreateOrderDto
       │
       ▼
  OrdersService.createOrder()  [application/orders/orders.service.ts]
  ← injected: IOrderRepository, IEventRepository, IUserRepository, PaystackService
       │
       ├── userRepo.findById(userId)          → UserPrismaRepository → PrismaService → Postgres
       ├── eventRepo.findById(dto.eventId)    → EventPrismaRepository → Postgres
       ├── eventRepo.findTicketTypeById(...)  → Postgres
       ├── orderRepo.create(...)              → Postgres
       └── paystack.initializeTransaction()  → HTTP call to api.paystack.co
       │
       ▼
  OrdersController returns { order, payment }  → JSON response to client
```

Every layer is only aware of the layer directly below it. The controller knows about the service. The service knows about the repository interface. The repository implementation knows about Prisma.

---

## 5. How modules wire everything together

A NestJS **Module** is a class decorated with `@Module({})`. It is the unit of organisation — it declares what providers exist and what it exports for other modules to use.

Look at `AuthModule` (`presentation/auth/auth.module.ts`):

```ts
@Module({
  imports: [PassportModule, JwtModule.registerAsync(...)],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: UserPrismaRepository },
    //   ↑ this line is the DI binding:
    //   "when someone asks for USER_REPOSITORY, give them UserPrismaRepository"
  ],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
```

The critical line is `{ provide: USER_REPOSITORY, useClass: UserPrismaRepository }`. This is what connects the domain interface (the symbol) to the infrastructure implementation. Without this, NestJS would not know what to inject when `AuthService` asks for `USER_REPOSITORY`.

`AppModule` (`src/app.module.ts`) is the root. It imports every feature module and every shared infrastructure module:

```
AppModule
├── ConfigModule    (global — makes .env values available everywhere)
├── ThrottlerModule (global rate limiting)
├── PrismaModule    (provides PrismaService globally)
├── RedisModule     (provides RedisService)
├── CloudinaryModule
├── PaystackModule
├── AuthModule
├── EventsModule
├── TicketsModule
├── OrdersModule
├── PaymentsModule
└── ScannerModule
```

---

## 6. The Repository Pattern explained

This is the most important design decision in the codebase. Here is why it exists and how to read it.

**The problem it solves:** if `AuthService` called `prisma.user.findUnique(...)` directly, the service would be permanently tied to Prisma. You could never test the service in isolation, and swapping databases would require rewriting every service.

**The solution:**

```
domain/user/repositories/user.repository.interface.ts
    defines: IUserRepository (interface)
    exports: USER_REPOSITORY (Symbol — the DI token)

infrastructure/database/repositories/user.prisma.repository.ts
    implements: IUserRepository (the actual Prisma code)

presentation/auth/auth.module.ts
    registers: { provide: USER_REPOSITORY, useClass: UserPrismaRepository }
    (this is where the interface gets connected to the implementation)

application/auth/auth.service.ts
    injects: @Inject(USER_REPOSITORY) private userRepo: IUserRepository
    (only ever talks to the interface — never to UserPrismaRepository directly)
```

This pattern repeats for every aggregate: `User`, `Event`, `Order`, `Ticket`.

---

## 7. Authentication flow in detail

```
POST /auth/register or /auth/login
         │
         ▼
AuthController.register() / .login()
         │
         ▼
AuthService.register()
  1. userRepo.findByEmail()  → check if email already exists
  2. bcrypt.hash(password, 12)  → hash the password (12 salt rounds)
  3. userRepo.create(...)  → save to Postgres
  4. jwtService.sign({ sub: user.id, email, role })  → create JWT
  5. return { accessToken, user }
```

On subsequent requests to protected routes:

```
GET /auth/me  (with Authorization: Bearer <token>)
         │
         ▼
JwtAuthGuard  ← triggers passport strategy
         │
         ▼
JwtStrategy.validate(payload)
  1. Decode token (verified against JWT_SECRET)
  2. Load user from DB: prisma.user.findUnique({ where: { id: payload.sub } })
  3. Check user.isActive
  4. Return { id, email, role }  ← this becomes request.user
         │
         ▼
@CurrentUser() in controller extracts request.user
```

---

## 8. Payment and ticket generation flow

This is the most complex flow in the system. It spans four services and two HTTP calls.

```
1. POST /api/v1/orders  (client → API)
   OrdersService.createOrder()
   ├── validates event is published
   ├── checks ticket availability
   ├── creates Order (status = PENDING) + OrderItems in Postgres
   └── calls PaystackService.initializeTransaction()
       → HTTP POST to api.paystack.co
       ← returns { authorizationUrl, reference }
   Returns { order, payment: { authorizationUrl } } to client

2. Client redirects user to authorizationUrl (Paystack payment page)
   User completes payment on Paystack's site

3. POST /api/v1/payments/webhook  (Paystack → API)
   PaymentsController.webhook()
   ├── reads raw request body (needed for HMAC verification)
   ├── verifies x-paystack-signature header with HMAC-SHA512
   └── calls PaymentsService.handleWebhook()
       ├── parses event type: "charge.success"
       ├── finds order by paystackRef
       ├── calls PaystackService.verifyTransaction() — double-checks with Paystack API
       ├── updates order status → PAID in Postgres
       └── calls TicketsService.generateTicketsForOrder()
           ├── creates one Ticket row per seat in Postgres
           ├── signs each ticket's QR payload with HMAC-SHA256
           ├── caches each ticket's status (isUsed: false) in Redis
           └── asynchronously generates QR code images (base64 data URLs)
```

**Why the raw body matters for webhooks:** NestJS and Express normally parse the JSON body before your code sees it. Paystack signs the raw bytes of the body. If you verify the signature against the parsed-and-re-serialised JSON, it won't match. The app is bootstrapped with `rawBody: true` (`main.ts`) so that `req.rawBody` always contains the original bytes.

---

## 9. QR code signing and ticket validation

The QR code is not just a ticket ID — it is a cryptographically signed token that prevents forgery.

**Creating a QR payload** (inside `TicketsService.signQrPayload`):

```
payload = { ticketId, eventId, issuedAt }
data    = JSON.stringify(payload)
sig     = HMAC-SHA256(data, QR_HMAC_SECRET)  → hex string
token   = base64url(data) + "." + sig
```

This token is stored in the database and encoded as a QR image. The QR scanner reads the token string.

**Validating a scanned QR** (`POST /api/v1/scanner/validate`):

```
1. Split token on "."  → [encoded, signature]
2. Decode encoded  → data string
3. Compute expected sig: HMAC-SHA256(data, QR_HMAC_SECRET)
4. Compare with timingSafeEqual()  ← constant-time comparison prevents timing attacks
5. If mismatch → return { status: "invalid" }

6. Check Redis cache for ticket:
   → if isUsed: true  → return { status: "already_used" } (fast path, no DB hit)

7. Query Postgres for ticket
   → if not found or wrong event → invalid
   → if already used → update Redis, return already_used

8. Mark ticket as used:
   → ticketRepo.markAsUsed()  → Postgres UPDATE
   → ticketCache.markTicketUsedInCache()  → Redis SET
   → prisma.scanLog.create()  → audit record in Postgres

9. Return { status: "valid" }
```

Redis acts as a fast first check — once a ticket is used, every subsequent scan hits Redis (microseconds) rather than Postgres (milliseconds). This matters at high-volume event gates.

---

## 10. DTO Validation

Every incoming request body is described by a **DTO** (Data Transfer Object) class decorated with `class-validator` decorators. The global `ValidationPipe` in `main.ts` runs automatically before any controller method is called.

Example — `RegisterDto`:
```ts
@IsEmail()        // validates email format
email: string;

@IsString()
@MinLength(8)     // password must be at least 8 chars
password: string;

@IsOptional()
@IsEnum(UserRole) // if provided, must be a known role
role?: UserRole;
```

If validation fails, NestJS returns a `400 Bad Request` automatically — the controller never runs. The `whitelist: true` option in the `ValidationPipe` also strips any properties not declared in the DTO, protecting against mass-assignment.

---

## 11. Entities with built-in business logic

Domain entities are not just data bags — some of them carry small business rules as methods. This keeps the logic close to the data it operates on, rather than scattered across services.

**`UserEntity`** (`domain/user/entities/user.entity.ts`):
```ts
get fullName(): string {
  return `${this.firstName} ${this.lastName}`;
}
isOrganizer(): boolean { return this.role === UserRole.ORGANIZER; }
isGateAgent(): boolean { return this.role === UserRole.GATE_AGENT; }
```

**`TicketTypeEntity`** (`domain/event/entities/ticket-type.entity.ts`):
```ts
get availableCount(): number {
  return this.quantity - this.soldCount;   // derived from two fields
}
hasAvailability(qty: number = 1): boolean {
  return this.availableCount >= qty;       // called in OrdersService before creating an order
}
```

**`OrderEntity`** (`domain/order/entities/order.entity.ts`):
```ts
isPaid(): boolean {
  return this.status === OrderStatus.PAID; // called in PaymentsService to skip re-processing
}
```

**`TicketEntity`** (`domain/ticket/entities/ticket.entity.ts`):
```ts
isValid(): boolean {
  return this.status === TicketStatus.ACTIVE && !this.isUsed;
}
```

The rule of thumb: if you need to ask a question *about* an entity's data, the answer should be a method on that entity — not an `if` statement buried in a service.

---

## 12. How `@Global()` modules work — the PrismaService example

Most modules only provide their services to modules that explicitly import them. `PrismaModule` breaks this rule by declaring itself `@Global()`:

```ts
// infrastructure/database/prisma.module.ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()` means that once `AppModule` imports `PrismaModule`, `PrismaService` is available everywhere in the application without needing to be re-imported into each feature module. That is why repositories like `UserPrismaRepository` can receive `PrismaService` in their constructors even though their modules (`AuthModule`, `OrdersModule`, etc.) never explicitly import `PrismaModule`.

`RedisModule` works the same way.

---

## 13. Module lifecycle hooks

NestJS calls specific methods on services at predictable moments. Two lifecycle interfaces are used in this codebase:

**`OnModuleInit`** — called once after the module's providers are all instantiated:
- `PrismaService.onModuleInit()` → calls `this.$connect()` to open the database connection pool
- `RedisService.onModuleInit()` → creates the `ioredis` client and registers `connect`/`error` listeners

**`OnModuleDestroy`** — called when the application shuts down (Ctrl+C, SIGTERM):
- `PrismaService.onModuleDestroy()` → calls `this.$disconnect()` to cleanly release DB connections
- `RedisService.onModuleDestroy()` → calls `this.client.quit()` to close the Redis connection

This is why you never see `new Redis(...)` or `prisma.$connect()` inside a constructor — NestJS manages the timing of those calls through the lifecycle hooks, ensuring connections are established only after the DI container is fully ready.

---

## 14. How file uploads work — event banner images

When an organizer creates or updates an event, they can upload a banner image. This uses `multipart/form-data` — a different content type from standard JSON.

**In the controller** (`presentation/events/events.controller.ts`):

```ts
@Post()
@ApiConsumes('multipart/form-data')           // tells Swagger to show a file picker
@UseInterceptors(FileInterceptor('banner'))    // extracts the file field named "banner"
create(
  @CurrentUser() user: any,
  @Body() dto: CreateEventDto,
  @UploadedFile() banner?: Express.Multer.File,  // the file lands here
) {
  return this.eventsService.create(user.id, dto, banner);
}
```

`FileInterceptor('banner')` is a NestJS interceptor that wraps Multer (a standard Node.js file upload library). It holds the uploaded file in memory as a `Buffer` — the file is never written to disk on the API server.

**In the service** (`application/events/events.service.ts`):

```ts
if (bannerFile) {
  const result = await this.cloudinary.uploadImage(bannerFile, 'mugina-events');
  bannerUrl = result.secure_url;   // a permanent hosted URL, e.g. https://res.cloudinary.com/...
}
```

**In the infrastructure** (`infrastructure/cloudinary/cloudinary.service.ts`):

```ts
cloudinary.uploader
  .upload_stream({ folder, resource_type: 'image' }, (error, result) => { ... })
  .end(file.buffer);    // streams the Buffer directly to Cloudinary — no temp file needed
```

The returned `secure_url` is what gets stored in the `bannerUrl` column of the `events` table.

---

## 15. How the module dependency graph is built

When the application starts, NestJS reads `AppModule` and resolves every import chain. Here is the full picture for this codebase:

```
AppModule
│
├── ConfigModule [global]     → ConfigService available everywhere
├── ThrottlerModule           → rate limiting globally
├── PrismaModule  [global]    → PrismaService available everywhere
├── RedisModule   [global]    → RedisService + TicketCacheService available everywhere
├── CloudinaryModule          → CloudinaryService
├── PaystackModule            → PaystackService
│
├── AuthModule
│   ├── imports: PassportModule, JwtModule
│   ├── controllers: AuthController
│   ├── providers: AuthService, JwtStrategy, UserPrismaRepository (as USER_REPOSITORY)
│   └── exports: JwtModule, PassportModule  ← other modules can use JwtService
│
├── EventsModule
│   ├── controllers: EventsController
│   ├── providers: EventsService, EventPrismaRepository (as EVENT_REPOSITORY)
│   └── exports: EventsService, EventPrismaRepository
│
├── TicketsModule
│   ├── controllers: TicketsController
│   ├── providers: TicketsService, TicketPrismaRepository, EventPrismaRepository
│   └── exports: TicketsService  ← PaymentsModule imports this to call generateTicketsForOrder
│
├── OrdersModule
│   ├── controllers: OrdersController
│   └── providers: OrdersService, OrderPrismaRepository, EventPrismaRepository, UserPrismaRepository
│
├── PaymentsModule
│   ├── imports: TicketsModule  ← needs TicketsService to generate tickets after payment
│   ├── controllers: PaymentsController
│   └── providers: PaymentsService, OrderPrismaRepository
│
└── ScannerModule
    ├── imports: TicketsModule  ← needs TicketsService to validate QR codes
    └── controllers: ScannerController
```

The key dependency to notice: **`TicketsModule` is exported and consumed by both `PaymentsModule` and `ScannerModule`**. Rather than duplicating `TicketsService` in both, `TicketsModule` exports it and those modules import the whole module.

---

## 16. How errors are handled

NestJS maps thrown exceptions to HTTP responses automatically. The pattern used throughout the codebase:

| Thrown exception | HTTP status | When it's used |
|---|---|---|
| `NotFoundException` | 404 | Record not found by ID |
| `UnauthorizedException` | 401 | Invalid credentials or expired JWT |
| `ForbiddenException` | 403 | User exists but lacks permission |
| `ConflictException` | 409 | Duplicate (e.g. email already registered) |
| `BadRequestException` | 400 | Business rule violation (e.g. event not published) |

These all come from `@nestjs/common`. You throw them like normal JavaScript errors:

```ts
const event = await this.eventRepo.findById(id);
if (!event) throw new NotFoundException('Event not found');
if (event.organizerId !== organizerId) throw new ForbiddenException('Access denied');
```

NestJS's built-in exception filter catches them and converts them to a JSON response:
```json
{ "statusCode": 404, "message": "Event not found", "error": "Not Found" }
```

DTO validation failures produce a similar shape automatically, with a `message` array listing every field that failed.

---

## 17. How environment variables are accessed

`ConfigModule.forRoot({ isGlobal: true })` in `AppModule` loads the `.env` file once and makes `ConfigService` injectable everywhere without re-importing.

Usage pattern in any service:
```ts
constructor(private readonly config: ConfigService) {}

// Read with a typed default
const secret = this.config.get<string>('JWT_SECRET', 'fallback');
const port   = this.config.get<number>('PORT', 3001);
```

Because `ConfigModule` is `isGlobal: true`, any module that needs `ConfigService` can just add it to its constructor without importing `ConfigModule` again. This is consistent across the entire codebase: `PaystackService`, `CloudinaryService`, `JwtModule`, `RedisService`, and `TicketsService` all receive `ConfigService` this way.

---

## 18. How to add a new feature (end-to-end walkthrough)

To add a completely new feature — say, **refunds** — here are the exact steps and which files to create, in order.

### Step 1 — Domain entity

Create `src/domain/refund/entities/refund.entity.ts`:
```ts
export class RefundEntity {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  createdAt: Date;
}
```

### Step 2 — Repository interface

Create `src/domain/refund/repositories/refund.repository.interface.ts`:
```ts
import { RefundEntity } from '../entities/refund.entity';

export interface IRefundRepository {
  create(data: Partial<RefundEntity>): Promise<RefundEntity>;
  findByOrderId(orderId: string): Promise<RefundEntity[]>;
}

export const REFUND_REPOSITORY = Symbol('IRefundRepository');
```

### Step 3 — Prisma schema

Add a `Refund` model to `prisma/schema.prisma`, then run:
```bash
yarn prisma:migrate    # creates the migration file and applies it
yarn prisma:generate   # regenerates the Prisma client
```

### Step 4 — Infrastructure implementation

Create `src/infrastructure/database/repositories/refund.prisma.repository.ts`:
```ts
@Injectable()
export class RefundPrismaRepository implements IRefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<RefundEntity>): Promise<RefundEntity> {
    const raw = await this.prisma.refund.create({ data: data as any });
    // map raw → entity
    const entity = new RefundEntity();
    Object.assign(entity, raw);
    return entity;
  }

  async findByOrderId(orderId: string): Promise<RefundEntity[]> {
    const rows = await this.prisma.refund.findMany({ where: { orderId } });
    return rows.map(r => Object.assign(new RefundEntity(), r));
  }
}
```

### Step 5 — DTO

Create `src/application/refunds/dto/create-refund.dto.ts`:
```ts
export class CreateRefundDto {
  @IsString() orderId: string;
  @IsString() reason: string;
}
```

### Step 6 — Application service

Create `src/application/refunds/refunds.service.ts`:
```ts
@Injectable()
export class RefundsService {
  constructor(
    @Inject(REFUND_REPOSITORY)
    private readonly refundRepo: IRefundRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
  ) {}

  async createRefund(dto: CreateRefundDto) {
    const order = await this.orderRepo.findById(dto.orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (!order.isPaid()) throw new BadRequestException('Only paid orders can be refunded');
    return this.refundRepo.create({ orderId: dto.orderId, reason: dto.reason, amount: order.totalAmount });
  }
}
```

### Step 7 — Controller

Create `src/presentation/refunds/refunds.controller.ts`:
```ts
@ApiTags('Refunds')
@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER')
@ApiBearerAuth()
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  create(@Body() dto: CreateRefundDto) {
    return this.refundsService.createRefund(dto);
  }
}
```

### Step 8 — Module

Create `src/presentation/refunds/refunds.module.ts`:
```ts
@Module({
  controllers: [RefundsController],
  providers: [
    RefundsService,
    { provide: REFUND_REPOSITORY, useClass: RefundPrismaRepository },
    { provide: ORDER_REPOSITORY, useClass: OrderPrismaRepository },
  ],
})
export class RefundsModule {}
```

### Step 9 — Register in AppModule

Add `RefundsModule` to the `imports` array in `src/app.module.ts`. That is it — NestJS will discover the controller and register the routes automatically.

---

## 19. Summary: reading a new piece of code

When you open an unfamiliar file, ask:

| If the file is in… | It should… |
|---|---|
| `domain/` | Define an entity class or a repository interface. No imports from other layers. |
| `application/` | Contain one service. Inject repository interfaces (by Symbol), not concrete classes. |
| `infrastructure/` | Implement a domain interface (repository) or wrap a third-party library. |
| `presentation/` | Contain a controller, guard, strategy, or decorator. Call application services only. |

When you see `@Inject(SOME_REPOSITORY)` in a service, find the binding in the feature's `*.module.ts` file under `providers` — that is where the Symbol is matched to a concrete class.

When you see `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ORGANIZER')` on a route, two checks run before the handler: the JWT is verified and decoded, then the user's role is compared against the required roles.

When you see `OnModuleInit` / `OnModuleDestroy` on a service, those methods manage an external connection — they run at startup and shutdown respectively, not per-request.
