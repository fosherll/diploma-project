import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout.jsx";
import VacanciesPage from "./pages/VacanciesPage.jsx";
import VacancyDetailsPage from "./pages/VacancyDetailsPage.jsx";
import ClusteringPage from "./pages/ClusteringPage.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <AppLayout>
                <Routes>
                    <Route path="/" element={<VacanciesPage />} />
                    <Route path="/vacancies/:vacancyId" element={<VacancyDetailsPage />} />
                    <Route path="/clustering" element={<ClusteringPage />} />
                </Routes>
            </AppLayout>
        </BrowserRouter>
    );
}