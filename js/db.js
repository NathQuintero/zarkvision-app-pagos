const DB = {
    // BRIGADAS
    async getBrigadas() {
        const { data, error } = await supabase.from('brigadas').select('*').order('fecha_evento', { ascending: false });
        if (error) throw error;
        return data;
    },
    async guardarBrigada(brigada) {
        const { data, error } = await supabase.from('brigadas').insert([brigada]).select();
        if (error) throw error;
        return data;
    },

    // CLIENTES
    async getClientesPorBrigada(brigadaId) {
        const { data, error } = await supabase.from('clientes_brigada').select('*').eq('brigada_id', brigadaId).order('nombre', { ascending: true });
        if (error) throw error;
        return data;
    },
    async getAllClientes() {
        const { data, error } = await supabase.from('clientes_brigada').select('*');
        if (error) throw error;
        return data;
    },
    async guardarCliente(cliente) {
        const { data, error } = await supabase.from('clientes_brigada').insert([cliente]).select();
        if (error) throw error;
        return data;
    },
    async eliminarCliente(clienteId) {
        const { data, error } = await supabase.from('clientes_brigada').delete().eq('id', clienteId);
        if (error) throw error;
        return data;
    },

    // ABONOS
    async getAbonosDeCliente(clienteId) {
        const { data, error } = await supabase.from('abonos_clientes').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false });
        if (error) throw error;
        return data;
    },
    async guardarAbono(clienteId, monto, metodo) {
        const { data, error } = await supabase
            .from('abonos_clientes')
            .insert([{ 
                cliente_id: clienteId, 
                monto: parseFloat(monto),
                metodo_pago: metodo // <--- Guarda el método seleccionado (Efectivo, Nequi, etc.)
            }]);
            
        if (error) throw error;
        return data;
    },
    async eliminarAbono(abonoId, clienteId, montoAbono) {
        const { error: errorDelete } = await supabase.from('abonos_clientes').delete().eq('id', abonoId);
        if (errorDelete) throw errorDelete;

        const { data: clienteActual } = await supabase.from('clientes_brigada').select('valor_abonado').eq('id', clienteId).single();
        if (clienteActual) {
            const nuevoAbonado = Math.max(0, clienteActual.valor_abonado - montoAbono);
            await supabase.from('clientes_brigada').update({ valor_abonado: nuevoAbonado }).eq('id', clienteId);
        }
        return true;
    },

    // RECORDATORIOS ÓPTICA
    async getRecordatoriosOptica() {
        const { data, error } = await supabase.from('recordatorios_optica').select('*').order('finalizado', { ascending: true }).order('fecha_alerta', { ascending: true });
        if (error) throw error;
        return data;
    },
    async guardarRecordatorio(rec) {
        const { data, error } = await supabase.from('recordatorios_optica').insert([rec]).select();
        if (error) throw error;
        return data;
    },
    async marcarRecordatorioFinalizado(id) {
        const { data, error } = await supabase.from('recordatorios_optica').update({ finalizado: true }).eq('id', id).select();
        if (error) throw error;
        return data;
    }
};