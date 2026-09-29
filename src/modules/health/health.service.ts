const getHealth = () => {
    return {
        success: true,
        message: "Amar Haat backend is running",
    };
};

export const healthService = {
    getHealth,
};