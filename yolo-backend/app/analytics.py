"""Adds the user's floor area to room_analytics.Analytics, which stays untouched."""
import cv2
import numpy as np

import room_analytics as ra


class AreaAnalytics(ra.Analytics):
    """Everyone is still tracked and counted. The floor area only decides the zone name:
    outside it is None, which Analytics reports as Outside."""

    def __init__(self, cfg: ra.Config, fps: float, frame_size, area=None):
        super().__init__(cfg, fps, frame_size)
        self.area = None if area is None else np.float32(area).reshape(-1, 1, 2)

    def _zone_of(self, p):
        if self.area is not None and cv2.pointPolygonTest(self.area, (float(p[0]), float(p[1])), False) < 0:
            return None
        return super()._zone_of(p)
