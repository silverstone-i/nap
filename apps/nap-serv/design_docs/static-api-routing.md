# nap-serv API Routing Structure (Static Versioned Routing)

## 🧭 Overview
This routing pattern supports clean, versioned, modular route mounting using `Express.Router`, with full CRUD support and module-level isolation.

---

## 🔗 Top-Level Mounting in `app.js`
```js
app.use('/api', apiRoutes);
```

---

## 🗂 `src/apiRoutes.js`
```js
import express from 'express';

import tenantsApiRoutes from './modules/tenants/apiRoutes/v1/index.js';
import activitiesApiRoutes from './modules/activities/apiRoutes/v1/index.js';

const apiRouter = express.Router();

apiRouter.use('/tenants', tenantsApiRoutes);
apiRouter.use('/activities', activitiesApiRoutes);

export default apiRouter;
```

---

## 📁 Example: `modules/tenants/apiRoutes/v1/index.js`
```js
import express from 'express';

import tenantsApi from './tenantsApi.js';
import napUsersApi from './napUsersApi.js';

const router = express.Router();

router.use('/v1/tenants', tenantsApi);
router.use('/v1/nap-users', napUsersApi);

export default router;
```

---

## 🧩 Example Endpoint Mapping

### `/api/tenants/v1/tenants`
| Method | Endpoint                            | Description                 |
|--------|-------------------------------------|-----------------------------|
| GET    | `/api/tenants/v1/tenants`           | List tenants                |
| POST   | `/api/tenants/v1/tenants`           | Create tenant               |
| GET    | `/api/tenants/v1/tenants/:id`       | Get tenant by ID            |
| PUT    | `/api/tenants/v1/tenants/:id`       | Update tenant               |
| DELETE | `/api/tenants/v1/tenants/:id`       | Delete tenant               |
| GET    | `/api/tenants/v1/tenants/:id/modules` | Get allowed modules        |

### `/api/tenants/v1/nap-users`
| Method | Endpoint                              | Description         |
|--------|---------------------------------------|---------------------|
| GET    | `/api/tenants/v1/nap-users`           | List nap users      |
| POST   | `/api/tenants/v1/nap-users`           | Create nap user     |
| GET    | `/api/tenants/v1/nap-users/:id`       | Get user by ID      |
| PUT    | `/api/tenants/v1/nap-users/:id`       | Update nap user     |
| DELETE | `/api/tenants/v1/nap-users/:id`       | Delete nap user     |
