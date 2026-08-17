# SQL Cheat Sheet

SQL (Structured Query Language) is the standard language for relational database management.

## Basic Queries

```sql
-- select rows from a table
SELECT name, age FROM users WHERE age >= 18 ORDER BY age DESC LIMIT 10;

-- join two tables
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.status = 'paid';
```

## Aggregation

```sql
SELECT department, COUNT(*) AS headcount, AVG(salary) AS avg_salary
FROM employees
GROUP BY department
HAVING COUNT(*) > 5;
```

## Indexes

An index speeds up lookups. A B-tree index works well for equality and range queries,
while a covering index can serve a query entirely from the index without touching the table.