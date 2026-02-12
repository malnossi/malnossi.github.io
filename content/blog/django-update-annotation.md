+++
title="How to update Queryset with Annotation in Django"
date=2026-02-12
description="Update a Django queryset using annotations and subqueries, explain when this pattern is useful, and highlight common pitfalls to avoid."
[taxonomies]
tags=["Django","ORM"]
[extra]
[extra.cover]
image="django-annotated.png"
+++

# Introduction
When working with related models in Django, it’s common to derive a parent model’s value from data stored in its child models. A classic example is tracking the overall progress of a `Project` based on the progress of its associated `Task` objects. At first glance, this seems straightforward: ***calculate the average progress of all tasks and store it on the project***. However, the implementation details are more nuanced than they appear.

In this article, we’ll walk through how to compute a project’s progress dynamically using Django’s ORM, explore why the most obvious solution can lead to incorrect or inconsistent results, and discuss a robust approach to keeping aggregated data in sync. Along the way, we’ll touch on model relationships, query annotations, signals, and the trade-offs between storing computed values versus calculating them on demand.

By the end, you’ll not only understand how to implement this pattern correctly, but also gain insight into how Django handles related data under the hood and why being explicit about data consistency matters in real-world applications.
# The Problem
Let's say we have a project management system with two models:
```py
from django.db import models


class Project(models.Model):
    name = models.CharField(max_length=100)
    progress = models.DecimalField(
        max_digits=5,
        decimal_places=2, 
        default=0)

    def __str__(self):
        return self.name
    
    class Meta:
        db_table = "projects"


class Task(models.Model):
    project = models.ForeignKey(
        to=Project, on_delete=models.CASCADE)
        
    title = models.CharField(max_length=100)
    progress = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0)

    def __str__(self):
        return self.title
    
    class Meta:
        db_table = "tasks"
```
Our goal: **Update each project's progress to reflect the average progress of all its tasks.**

# The Intuitive Approach
If you're familiar with Django's ORM, you might try something like this:
```py
from django.db.models import Avg, F

Project.objects.annotate(
    avg_progress=Avg("task__progress")
).update(progress=F("avg_progress"))
```
This looks perfect, right? We annotate the average, then use `F()` to reference it in the update. Unfortunately, **this doesn't work**.

**Why It Fails ?**

Django's `update()` method cannot use fields created by `annotate()`. The reason is architectural: `update()` generates a single `SQL UPDATE` statement, while annotations require subqueries or joins that Django can't combine in this context.
> You won't find this documented explicitly because it's a limitation of how the ORM translates operations to SQL.

# Loop Through Objects
The most straightforward approach:
```py
from django.db.models import Avg

for project in Project.objects.annotate(
    avg_progress=Avg("task__progress")):

    project.progress = project.avg_progress
    project.save()
```
This approach has the advantage of being simple and intuitive: the logic is easy to follow, it behaves predictably, and for small datasets it performs perfectly well without adding unnecessary complexity. However, its weaknesses become apparent as the system scales. Because it performs a separate database query for each project, it introduces the classic ***N+1*** query problem, which can significantly degrade performance with larger datasets. Additionally, recalculating and saving each project individually may trigger model signals on every save, adding further overhead and potentially causing unintended side effects. While suitable for small applications or low-traffic environments, this strategy does not scale gracefully and should be reconsidered for more demanding use cases.

# Subquery
The most efficient solution uses Django's `Subquery`
```py
from django.db.models import Avg, OuterRef, Subquery

subquery = Project.objects.filter(
    id=OuterRef("id")
).annotate(
    avg_prog=Avg("task__progress")
).values("avg_prog")[:1]

num_updated = Project.objects.update(progress=Subquery(subquery))
```
This approach is far more efficient and scalable. By leveraging Django’s ORM features such as `Subquery` and `OuterRef`, the entire update can be executed in a single database query, making it performant even with large datasets. It avoids the `N+1` query problem entirely and keeps the logic clean, expressive, and idiomatic to Django. While the syntax is admittedly more advanced and may look intimidating at first glance, it remains elegant once understood. Another important distinction is that using `update()` does not trigger model `save()` methods or signals. In many cases, this is actually beneficial, as it avoids unnecessary side effects and improves performance, though it’s something to be aware of if your application depends on signals.

**How It Works**

At a high level, this solution pushes the aggregation logic down to the database layer. `OuterRef("id")` allows the subquery to reference the id of each project in the outer queryset being updated. The subquery then filters Task objects that belong to that specific project and calculates the average of their progress field. Finally, the outer `update()` call assigns the result of that subquery directly to the progress field of each project. The database handles the heavy lifting in one optimized query, ensuring both correctness and efficiency.

The resulting SQL looks something like:
```sql
UPDATE "projects" 
SET "progress" = (
    SELECT AVG("tasks"."progress") AS "avg_prog"
    FROM "projects" U0
    INNER JOIN "tasks" ON (U0."id" = "tasks"."project_id")
    WHERE U0."id" = "projects"."id"
    GROUP BY U0."id" 
    LIMIT 1
)
```
# Common Pitfalls
## Null Values
If some projects have no tasks, the average will be `NULL`
```py
from django.db.models import Avg, OuterRef, Subquery
from django.db.models.functions import Coalesce

subquery = Project.objects.filter(
    id=OuterRef("id")
).annotate(
    avg_prog=Coalesce(Avg("task__progress"), 0)  # Default to 0
).values("avg_prog")[:1]

Project.objects.update(progress=Subquery(subquery))
```
## Performance at Scale
For very large datasets, think millions of records, even efficient ORM queries may not be enough. In such cases, you should consider more scalable patterns. **Chunked updates** help avoid long running transactions by processing records in batches. **Background tasks** with tools like `Celery` move heavy recalculations out of the request cycle, keeping your application responsive. **Database triggers** can automatically maintain aggregates at the database level, though they shift logic outside Django. Finally, **denormalization** such as storing running totals instead of recalculating averages can significantly improve performance by turning expensive aggregate queries into lightweight incremental updates.

# Conclusion
Updating a parent model with aggregated data from its related children is a common Django pattern that often trips developers up. The most important lessons are simple: don’t try to combine `annotate()` with `update()`, use `Subquery()` and `OuterRef()` for efficient bulk updates, only loop through objects when working with small datasets or when signals are required, ensure your fields can safely store computed values, and always inspect the generated SQL to understand performance implications. The Subquery approach offers the ideal balance between Django’s ORM elegance and SQL-level efficiency, allowing you to keep aggregated fields in sync cleanly, predictably, and at scale.