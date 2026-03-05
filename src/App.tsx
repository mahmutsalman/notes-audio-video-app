import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import TopicsPage from './pages/TopicsPage';
import TopicDetailPage from './pages/TopicDetailPage';
import RecordingPage from './pages/RecordingPage';
import StudyPage from './pages/StudyPage';

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<TopicsPage />} />
        <Route path="/topic/:topicId" element={<TopicDetailPage />} />
        <Route path="/recording/:recordingId" element={<RecordingPage />} />
        <Route path="/study" element={<StudyPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
