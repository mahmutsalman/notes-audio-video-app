import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import TopicsPage from './pages/TopicsPage';
import TopicDetailPage from './pages/TopicDetailPage';
import RecordingPage from './pages/RecordingPage';
import StudyPage from './pages/StudyPage';
import SearchPage from './pages/SearchPage';
import CapturePage from './pages/CapturePage';
import PlansPage from './pages/PlansPage';
import SettingsPage from './pages/SettingsPage';
import ReviewPage from './pages/ReviewPage';

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<TopicsPage />} />
        <Route path="/topic/:topicId" element={<TopicDetailPage />} />
        <Route path="/recording/:recordingId" element={<RecordingPage />} />
        <Route path="/study" element={<StudyPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
