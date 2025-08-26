# 🧠 C++ vs. JavaScript: OOP Comparison

A concise guide for developers transitioning from C++ to JavaScript OOP.

---

## 🧱 1. Class Definition

| Feature           | C++                              | JavaScript                          |
|------------------|----------------------------------|-------------------------------------|
| Syntax           | `class MyClass { ... };`         | `class MyClass { ... }`             |
| Constructor      | Named after class                | `constructor()` method              |
| Access Modifiers | `public`, `private`, `protected` | Only `#private` in modern JS        |

**C++ Example:**

```cpp
class Person {
public:
  string name;
  Person(string n) : name(n) {}
};
```

**JavaScript Example:**

```js
class Person {
  constructor(name) {
    this.name = name;
  }
}
```

---

## 🪛 2. Inheritance and `super`

| Feature          | C++                                 | JavaScript                            |
|-----------------|--------------------------------------|---------------------------------------|
| Inheritance     | `class B : public A {}`              | `class B extends A {}`                |
| Super call      | `A::method()` or `Base::Base()`      | `super.method()` or `super()`         |

**C++:**

```cpp
class A {
public:
  void greet() {}
};

class B : public A {
  void greet() {
    A::greet();
  }
};
```

**JavaScript:**

```js
class A {
  greet() {}
}

class B extends A {
  greet() {
    super.greet();
  }
}
```

---

## 🧠 3. Instance vs Static Methods

| Feature        | C++                          | JavaScript                          |
|---------------|-------------------------------|-------------------------------------|
| Static Method | `static void foo()`           | `static foo()`                      |
| Call Style    | `A::foo()`                    | `ClassName.foo()`                   |

---

## 🛠 4. Memory & Binding

| Feature        | C++                               | JavaScript                             |
|----------------|------------------------------------|----------------------------------------|
| Memory         | Stack/Heap, RAII                  | Heap, Garbage Collected                |
| `this` Binding | Known at compile-time             | Dynamic; depends on how method is called |

**JS Example:**

```js
class A {
  log() {
    console.log(this); // `this` depends on call context
  }
}
```

---

## 🔄 5. Function Overloading

| Feature         | C++                        | JavaScript                  |
|----------------|-----------------------------|-----------------------------|
| Overloading     | Yes (based on signature)    | No (last method wins)       |

**C++:**

```cpp
class A {
  void foo(int x) {}
  void foo(double y) {}
};
```

**JS:**

```js
class A {
  foo(x) {
    // Only one version allowed
  }
}
```

---

## 🧩 6. Private Members

| Feature      | C++ uses `private:`            | JS uses `#field` (ES2022+) |
|--------------|--------------------------------|-----------------------------|

**JS:**

```js
class A {
  #secret = 123;

  getSecret() {
    return this.#secret;
  }
}
```

---

## ✅ Summary

- JavaScript now supports `class`, `extends`, `super()`, and private fields — but under the hood it's still prototype-based.
- Use `super.method()` to call base class methods.
- No method overloading — use optional arguments or `typeof`.

---
