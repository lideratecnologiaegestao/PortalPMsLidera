---
id: sip-token
title: Generate SIP Token
---

## Method

#### /sip-token

`POST` https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/sip-token

### Header

|      Key       |            Value            |
| :------------: |     :-----------------:     |
|  Client-Token  | **[ACCOUNT SECURITY TOKEN](../security/client-token)** |

---

## Concept

This method is used to generate SIP credentials for the instance.

These credentials allow integration with telephony services via the SIP protocol, enabling making and receiving calls.  
If an active SIP token already exists, this method will generate a new one and replace the old one.

---

:::caution Attention

To use this feature, the call functionality must be **enabled and contracted** for your account.  
Otherwise, the request may be denied.  
This endpoint should be used in the **backend** to avoid exposing sensitive credentials.

:::

---

## Request Params

**Method**

`POST` https://api.z-api.io/instances/YOUR_INSTANCE/token/YOUR_TOKEN/sip-token

---

## Request Body

This endpoint does **not** require a request body.

---

## Response

### 200

Returns the SIP credentials for the instance.

| Attribute | Type    | Description                       |
| :-------- | :-----: | :-------------------------------- |
| host      | string  | SIP server                        |
| user      | string  | SIP user identifier               |
| token     | string  | SIP authentication token          |
| active    | boolean | Indicates if SIP is active        |

**Example**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "token": "BZ9vKoEsmmrCP6y4t0XYCYBW5rMZrQmJAt6KfERWLvk",
  "active": true
}
```

### 405

In this case certify that you are sending the correct specification of the method. This means, verify if you sent a POST or GET as specified at the beginning of this topic.

### 415

In case you receive 415 error, make sure to add the “Content-Type” of the object you are sending in the request headers, mostly “application/json”

---


