---
id: sip-info
title: Get SIP Information
---

## Method

#### /sip-info

`GET` https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/sip-info

### Header

|      Key       |            Value            |
| :------------: |     :-----------------:     |
|  Client-Token  | **[ACCOUNT SECURITY TOKEN](../security/client-token)** |

---

## Concept

This method is used to retrieve SIP information for the instance.

It allows you to check if a SIP token has already been configured and whether the service is active.

---

:::caution Attention

To use this feature, the call functionality must be **enabled and contracted** for your account.  
This endpoint should be used in the **backend** to avoid exposing sensitive credentials.

:::

---

## Request Params

**Method**

`GET` https://api.z-api.io/instances/YOUR_INSTANCE/token/YOUR_TOKEN/sip-info

---

## Request Body

This endpoint does **not** require a request body.

---

## Response

### 200

Returns SIP information for the instance.

#### When a token is already configured:

| Attribute | Type    | Description                       |
| :-------- | :-----: | :-------------------------------- |
| host      | string  | SIP server                        |
| user      | string  | SIP user identifier               |
| token     | string  | Masked token                       |
| active    | boolean | Indicates if SIP is active        |

**Example**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "token": "BZ9***",
  "active": true
}
```

#### When no token is configured:

| Attribute | Type    | Description                       |
| :-------- | :-----: | :-------------------------------- |
| host      | string  | SIP server                        |
| user      | string  | SIP user identifier               |
| active    | boolean | Indicates that SIP is not active  |

**Example**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "active": false
}
```

### 405

In this case certify that you are sending the correct specification of the method. This means, verify if you sent a GET or GET as specified at the beginning of this topic.

### 415

In case you receive 415 error, make sure to add the “Content-Type” of the object you are sending in the request headers, mostly “application/json”

---
