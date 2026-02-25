from django.db import models
from django.contrib.auth.models import User


# ─── Task Model (for CRUD API) ───────────────────────────────────────────────

class Task(models.Model):
    user    = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    title   = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    completed   = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title