import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout.jsx";
import VacanciesPage from "./pages/VacanciesPage.jsx";
import VacancyDetailsPage from "./pages/VacancyDetailsPage.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <AppLayout>
                <Routes>
                    <Route path="/" element={<VacanciesPage />} />
                    <Route path="/vacancies/:vacancyId" element={<VacancyDetailsPage />} />
                </Routes>
            </AppLayout>
        </BrowserRouter>
    );
}