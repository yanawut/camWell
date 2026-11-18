import unittest

from vision_service.go2rtc import stream_candidates


class Go2rtcLinkTests(unittest.TestCase):
    def test_direct_camera_rtsp_keeps_query_parameters(self):
        link = "rtsp://user:example-password@camera.local:554/cam/realmonitor?channel=1&subtype=1"
        self.assertEqual(stream_candidates(link), [link])

    def test_go2rtc_page_prefers_rtsp_then_falls_back_to_mjpeg(self):
        self.assertEqual(
            stream_candidates("http://go2rtc.local:1984/stream.html?src=front%20desk"),
            [
                "rtsp://go2rtc.local:8554/front%20desk",
                "http://go2rtc.local:1984/api/stream.mjpeg?src=front%20desk",
            ],
        )

    def test_go2rtc_mjpeg_endpoint_passes_through(self):
        link = "http://go2rtc.local:1984/api/stream.mjpeg?src=front"
        self.assertEqual(stream_candidates(link), [link])


if __name__ == "__main__":
    unittest.main()
