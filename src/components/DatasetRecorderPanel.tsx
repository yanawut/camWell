import { useEffect, useState } from 'react'
import {
  DATASET_LABELS,
  datasetRecorder,
  type DatasetLabel,
} from '../services/datasetRecorder'
import type { PostureThresholds } from '../types/posture'

interface Props {
  postureThresholds: PostureThresholds
}

export default function DatasetRecorderPanel({ postureThresholds }: Props) {
  const [label, setLabel] = useState<DatasetLabel>('GOOD')
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setCount(datasetRecorder.count())
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  const toggleRecording = () => {
    if (recording) {
      datasetRecorder.stop()
      setRecording(false)
      return
    }

    datasetRecorder.start(label)
    setRecording(true)
  }

  const clearDataset = () => {
    datasetRecorder.clear()
    setCount(0)
  }

  return (
    <div className="panel">
      <h2>Dataset Recorder (สำหรับนักพัฒนา)</h2>
      <p className="panel-note">
        บันทึกเฉพาะตัวเลข landmark/feature ไม่บันทึกภาพหรือวิดีโอ · ต้องมีคนเดียวในเฟรม
      </p>
      <label className="settings-row">
        <span>Label ท่าที่กำลังจะบันทึก</span>
        <select
          value={label}
          disabled={recording}
          onChange={(event) => setLabel(event.target.value as DatasetLabel)}
        >
          {DATASET_LABELS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={toggleRecording}>
        {recording ? `■ หยุดบันทึก (${label})` : '● เริ่มบันทึก'}
      </button>
      <p>จำนวนตัวอย่างที่เก็บแล้ว: {count.toLocaleString()}</p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => datasetRecorder.exportJson(postureThresholds)}
        disabled={count === 0}
      >
        Export เป็น JSON
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={clearDataset}
        disabled={recording || count === 0}
      >
        ล้างข้อมูลทั้งหมด
      </button>
    </div>
  )
}
