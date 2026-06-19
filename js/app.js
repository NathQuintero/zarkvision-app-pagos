let brigadaSeleccionadaId = null;
let cacheClientesActuales = [];

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    const hoy = new Date();
    document.getElementById('txt-fecha-hoy').innerText = hoy.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    initApp();
    setupMascarasDinero(); // Activa los puntos automáticos al escribir
});

// Control del menú responsivo móvil
function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    sidebar.classList.toggle('open');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById('app-sidebar').classList.remove('open');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// FUNCIÓN DE FORMATO EN DINERO
function formatearDinero(numero) {
    if (!numero) return "$0";
    return "$" + Math.round(numero).toLocaleString('es-CO');
}

// FUNCIÓN PARA PONER PUNTOS AUTOMÁTICOS MIENTRAS ESCRIBES
function setupMascarasDinero() {
    const inputsDinero = ['c-lente', 'c-montura', 'c-extra', 'c-abono', 'abono-monto'];
    
    inputsDinero.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.type = 'text';
            input.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, ''); 
                if (val) {
                    e.target.value = Number(val).toLocaleString('es-CO');
                } else {
                    e.target.value = '';
                }
                
                if (id === 'c-lente' || id === 'c-montura' || id === 'c-extra') {
                    calcularTotalCliente();
                }
            });
        }
    });
}

function obtenerValorNumerico(id) {
    const input = document.getElementById(id);
    if (!input || !input.value) return 0;
    return parseFloat(input.value.replace(/\./g, '')) || 0;
}

function calcularTotalCliente() {
    const lente = obtenerValorNumerico('c-lente');
    const montura = obtenerValorNumerico('c-montura');
    const extra = obtenerValorNumerico('c-extra');
    const total = lente + montura + extra;
    
    document.getElementById('c-total').value = total;
    document.getElementById('c-total-format').value = formatearDinero(total);
}

async function initApp() {
    await refrescarDashboardYAlertas();
    await cargarBrigadasEstiloLaboratorio();
    setupFormListeners();
}

function setupFormListeners() {
    const formBrigada = document.getElementById('form-brigada');
    
    const clonFormBrigada = formBrigada.cloneNode(true);
    formBrigada.parentNode.replaceChild(clonFormBrigada, formBrigada);

    // ==========================================
    // 1. ESCUCHA GUARDAR BRIGADA
    // ==========================================
    document.getElementById('form-brigada').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const botonGuardar = e.target.querySelector('button[type="submit"]');
        if (botonGuardar) {
            botonGuardar.disabled = true;
            botonGuardar.innerText = "Guardando...";
        }

        const b = {
            nombre_lugar: document.getElementById('b-lugar').value,
            fecha_evento: document.getElementById('b-fecha').value || new Date().toISOString().split('T')[0]
        };
        try {
            await DB.guardarBrigada(b);
            closeModal('modal-brigada');
            document.getElementById('form-brigada').reset();
            await initApp();
        } catch (err) { 
            alert("Error: " + err.message); 
        } finally {
            if (botonGuardar) {
                botonGuardar.disabled = false;
                botonGuardar.innerText = "Guardar Brigada";
            }
        }
    });

    // ==========================================
    // 2. ESCUCHA GUARDAR CLIENTE
    // ==========================================
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) {
        const clonFormCliente = formCliente.cloneNode(true);
        formCliente.parentNode.replaceChild(clonFormCliente, formCliente);

        document.getElementById('form-cliente').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const botonGuardar = e.target.querySelector('button[type="submit"]');
            if (botonGuardar) {
                botonGuardar.disabled = true;
                botonGuardar.innerText = "Guardando...";
            }

            const total = parseFloat(document.getElementById('c-total').value) || 0;
            const abonoInicial = obtenerValorNumerico('c-abono');
            const metodoAbono = document.getElementById('c-abono-metodo').value; 
            
            const c = {
                brigada_id: brigadaSeleccionadaId,
                nombre: document.getElementById('c-nombre').value,
                telefono: document.getElementById('c-telefono').value,
                valor_lente: obtenerValorNumerico('c-lente'),
                valor_montura: obtenerValorNumerico('c-montura'),
                valor_extra: obtenerValorNumerico('c-extra'),
                valor_total: total,
                valor_abonado: abonoInicial,
                dia_pago_1: parseInt(document.getElementById('c-dia1').value),
                dia_pago_2: document.getElementById('c-dia2').value ? parseInt(document.getElementById('c-dia2').value) : null
            };

            try {
                await DB.guardarCliente(c);
                
                if (abonoInicial > 0) {
                    const todos = await DB.getClientesPorBrigada(brigadaSeleccionadaId);
                    const guardado = todos.find(item => item.nombre === c.nombre);
                    if (guardado) {
                        await supabase.from('abonos_clientes').insert([{ 
                            cliente_id: guardado.id, 
                            monto: abonoInicial,
                            metodo_pago: metodoAbono 
                        }]);
                    }
                }
                
                closeModal('modal-cliente');
                document.getElementById('form-cliente').reset();
                document.getElementById('c-total-format').value = "$0";
                await cargarClientesDeBrigada(brigadaSeleccionadaId);
                await cargarBrigadasEstiloLaboratorio(); // <-- Actualiza la tarjeta al instante
                await refrescarDashboardYAlertas();
            } catch (err) { 
                alert("Error al guardar cliente: " + err.message); 
            } finally {
                if (botonGuardar) {
                    botonGuardar.disabled = false;
                    botonGuardar.innerText = "Guardar Cliente";
                }
            }
        });
    }

    // ==========================================
    // 3. ESCUCHA GUARDAR ABONO (¡CORREGIDO EN VIVO!)
    // ==========================================
    document.getElementById('form-abono').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('abono-cliente-id').value;
        const monto = obtenerValorNumerico('abono-monto'); 
        const metodo = document.getElementById('abono-metodo').value; 

        try {
            await DB.guardarAbono(id, monto, metodo); 
            document.getElementById('form-abono').reset();
            
            // SOLUCIÓN AQUÍ: Forzamos la descarga de datos nuevos para actualizar las vistas de fondo
            await cargarClientesDeBrigada(brigadaSeleccionadaId);
            await cargarBrigadasEstiloLaboratorio(); 
            await refrescarDashboardYAlertas();
            
            // Re-ejecutamos la renderización del historial sin cerrar el modal
            await abrirModalAbonosYHistorial(id); 
        } catch (err) { 
            alert("Error: " + err.message); 
        }
    });

    // ==========================================
    // 4. ESCUCHA GUARDAR RECORDATORIO
    // ==========================================
    document.getElementById('form-recordatorio').addEventListener('submit', async (e) => {
        e.preventDefault();
        const rec = {
            descripcion: document.getElementById('r-descripcion').value,
            fecha_alerta: document.getElementById('r-fecha').value
        };
        try {
            await DB.guardarRecordatorio(rec);
            closeModal('modal-recordatorio');
            document.getElementById('form-recordatorio').reset();
            await refrescarDashboardYAlertas();
        } catch (err) { alert("Error: " + err.message); }
    });
}

async function refrescarDashboardYAlertas() {
    const clientes = await DB.getAllClientes();
    const recordatorios = await DB.getRecordatoriosOptica();
    const brigadas = await DB.getBrigadas();
    
    document.getElementById('dash-total-brigadas').innerText = brigadas.length;
    document.getElementById('dash-total-clientes').innerText = clientes.length;
    
    const pendientesOptica = recordatorios.filter(r => !r.finalizado).length;
    document.getElementById('dash-alertas-optica').innerText = pendientesOptica;
    
    const diaHoy = new Date().getDate();
    const containerAlertas = document.getElementById('lista-alertas-cobro');
    containerAlertas.innerHTML = '';
    
    let contAlertas = 0;
    clientes.forEach(c => {
        const saldo = c.valor_total - c.valor_abonado;
        if(saldo > 0 && (c.dia_pago_1 === diaHoy || c.dia_pago_2 === diaHoy)) {
            contAlertas++;
            containerAlertas.innerHTML += `
                <div class="pendiente-row shadow-sm" style="background: #fffbeb; border-left: 4px solid #d97706; margin-bottom: 0.5rem; border-radius: 0.5rem;">
                    <div class="pendiente-left">
                        <div>
                            <span class="badge-alert">COBRO HOY</span>
                            <p class="pendiente-desc" style="margin-top:0.25rem;">${c.nombre}</p>
                            <p class="pendiente-date">Saldo Pendiente: <strong>${formatearDinero(saldo)}</strong></p>
                        </div>
                    </div>
                    <button class="btn" style="background:#22c55e; color:white;" onclick="enviarWhatsApp('${c.nombre}', '${c.telefono}', ${saldo})">
                        <i data-lucide="message-circle"></i> Enviar Recordatorio
                    </button>
                </div>
            `;
        }
    });
    
    if(contAlertas === 0) {
        containerAlertas.innerHTML = '<p style="color:var(--success); font-weight:500;">✨ No hay cobros programados para el día de hoy.</p>';
    }

    const containerRecs = document.getElementById('lista-recordatorios');
    containerRecs.innerHTML = '';
    
    recordatorios.forEach(r => {
        containerRecs.innerHTML += `
            <div class="pendiente-row ${r.finalizado ? 'done' : ''}">
                <div class="pendiente-left">
                    <i data-lucide="${r.finalizado ? 'check-circle' : 'circle'}" class="${r.finalizado ? 'text-success' : 'text-muted'}"></i>
                    <div>
                        <p class="pendiente-desc" style="${r.finalizado ? 'text-decoration: line-through;' : ''}">${r.descripcion}</p>
                        <p class="pendiente-date">📅 Alerta: ${r.fecha_alerta}</p>
                    </div>
                </div>
                ${!r.finalizado ? `<button class="btn btn-sm btn-primary" onclick="finalizarTarea('${r.id}')">Resolver</button>` : '<span>Finalizado</span>'}
            </div>
        `;
    });
    lucide.createIcons();
}

async function finalizarTarea(id) {
    await DB.marcarRecordatorioFinalizado(id);
    await refrescarDashboardYAlertas();
}

// CORREGIDA: AHORA MUESTRA EL NÚMERO DE CLIENTES REALES Y SUMA BIEN LOS VALORES EN VIVO
async function cargarBrigadasEstiloLaboratorio() {
    const grid = document.getElementById('grid-brigadas-cards');
    if (!grid) return;
    
    grid.innerHTML = '';
    const brigadas = await DB.getBrigadas();
    const todosClientes = await DB.getAllClientes();
    
    brigadas.forEach(b => {
        const clientesDeEsta = todosClientes.filter(c => c.brigada_id === b.id);
        let recaudado = 0;
        let totalVendido = 0;
        
        clientesDeEsta.forEach(c => {
            recaudado += parseFloat(c.valor_abonado || 0);
            totalVendido += parseFloat(c.valor_total || 0);
        });
        
        const porCobrar = totalVendido - recaudado;
        const esSeleccionada = b.id === brigadaSeleccionadaId ? 'selected' : '';

        grid.innerHTML += `
            <div class="lab-card ${esSeleccionada}" onclick="seleccionarBrigada('${b.id}', '${b.nombre_lugar}')">
                <div class="lab-header">
                    <div>
                        <h4 class="lab-title">${b.nombre_lugar} (${clientesDeEsta.length} clnt)</h4>
                        <span class="lab-meta">📅 ${b.fecha_evento}</span>
                    </div>
                    <button class="btn btn-sm btn-danger" style="padding: 4px 8px;" onclick="event.stopPropagation(); eliminarBrigada('${b.id}', '${b.nombre_lugar}')">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="lab-body-grid">
                    <div>
                        <p class="lab-stat-label">RECAUDADO</p>
                        <p class="lab-stat-val" style="color:var(--success)">${formatearDinero(recaudado)}</p>
                    </div>
                    <div>
                        <p class="lab-stat-label">POR COBRAR</p>
                        <p class="lab-stat-val" style="color:var(--danger)">${formatearDinero(porCobrar)}</p>
                    </div>
                </div>
            </div>
        `;
    });
    lucide.createIcons();
}

async function eliminarBrigada(id, nombre) {
    if (confirm(`⚠️ ¿Estás completamente seguro de eliminar la brigada "${nombre}"?\nEsto también podría borrar o desvincular los clientes de esta zona.`)) {
        try {
            const { error } = await supabase.from('brigadas').delete().eq('id', id);
            if (error) throw error;
            
            if (brigadaSeleccionadaId === id) {
                brigadaSeleccionadaId = null;
                document.getElementById('seccion-clientes-detalle').style.display = 'none';
            }
            
            await initApp();
        } catch (err) {
            alert("No se pudo eliminar la brigada: " + err.message);
        }
    }
}

async function seleccionarBrigada(id, nombre) {
    brigadaSeleccionadaId = id;
    document.getElementById('seccion-clientes-detalle').style.display = 'block';
    document.getElementById('titulo-brigada-actual').innerText = `Clientes en: ${nombre}`;
    await cargarClientesDeBrigada(id);
    await cargarBrigadasEstiloLaboratorio();
}

async function cargarClientesDeBrigada(id) {
    cacheClientesActuales = await DB.getClientesPorBrigada(id);
    renderizarTablaClientes(cacheClientesActuales);
}

function renderizarTablaClientes(lista) {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    lista.forEach(c => {
        const saldo = c.valor_total - c.valor_abonado;
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.telefono}</td>
                <td>
                    <span style="font-size:0.85rem; color:var(--text-muted)">Lente: ${formatearDinero(c.valor_lente)} | Montura: ${formatearDinero(c.valor_montura)}</span><br>
                    <strong>Total:</strong> ${formatearDinero(c.valor_total)}
                </td>
                <td>Día ${c.dia_pago_1}${c.dia_pago_2 ? ' y ' + c.dia_pago_2 : ''}</td>
                <td><strong style="color: ${saldo > 0 ? 'var(--danger)' : 'var(--success)'}">${formatearDinero(saldo)}</strong></td>
                <td>
                    <div style="display:flex; gap:0.25rem;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalAbonosYHistorial('${c.id}')"><i data-lucide="wallet"></i> Pagos</button>
                        ${saldo > 0 ? `<button class="btn btn-sm" style="background:#22c55e; color:white;" onclick="enviarWhatsApp('${c.nombre}','${c.telefono}',${saldo})"><i data-lucide="message-square"></i> Cobro</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="eliminarCliente('${c.id}')"><i data-lucide="trash-2"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

function filtrarClientesLocalmente() {
    const busqueda = document.getElementById('buscar-cliente').value.toLowerCase();
    const filtrados = cacheClientesActuales.filter(c => c.nombre.toLowerCase().includes(busqueda));
    renderizarTablaClientes(filtrados);
}

// CORREGIDA: AHORA BUSCA SIEMPRE LOS SALDOS FRESCOS DE CACHÉ AL RE-RENDERIZAR
async function abrirModalAbonosYHistorial(clienteId) {
    const cliente = cacheClientesActuales.find(item => item.id === clienteId);
    if(!cliente) return;
    
    document.getElementById('abono-cliente-id').value = clienteId;
    document.getElementById('txt-abono-cliente-nombre').innerText = `Cliente: ${cliente.nombre}`;
    
    const saldo = cliente.valor_total - cliente.valor_abonado;
    document.getElementById('txt-abono-saldo-pendiente').innerText = formatearDinero(saldo);
    
    const abonos = await DB.getAbonosDeCliente(clienteId);
    const container = document.getElementById('lista-abonos-historial-items');
    container.innerHTML = '';
    
    abonos.forEach(a => {
        const fechaFormat = new Date(a.fecha || a.created_at).toLocaleDateString('es-CO');
        const metodoPago = a.metodo_pago || 'Efectivo'; 
        
        container.innerHTML += `
            <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee;">
                <div>
                    <strong>${formatearDinero(a.monto)}</strong>
                    <span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; font-weight: bold;">
                        ${metodoPago}
                    </span>
                    <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">📅 ${fechaFormat}</span>
                </div>
                <button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="eliminarAbono('${a.id}', '${clienteId}', ${a.monto})">✕</button>
            </div>
        `;
    });
    
    openModal('modal-abonos-historial');
}

async function eliminarCliente(id) {
    if(confirm("⚠ ¿Estás seguro de eliminar este cliente? Se borrará todo su historial financiero.")) {
        await DB.eliminarCliente(id);
        await cargarClientesDeBrigada(brigadaSeleccionadaId);
        await cargarBrigadasEstiloLaboratorio();
        await refrescarDashboardYAlertas();
    }
}

async function eliminarAbono(abonoId, clienteId, monto) {
    if(confirm(`¿Deseas eliminar este abono de ${formatearDinero(monto)}?`)) {
        await DB.eliminarAbono(abonoId, clienteId, monto);
        closeModal('modal-abonos-historial');
        await cargarClientesDeBrigada(brigadaSeleccionadaId);
        await cargarBrigadasEstiloLaboratorio();
        await refrescarDashboardYAlertas();
    }
}

function enviarWhatsApp(nombre, telefono, saldo) {
    const mensaje = `hola! ${nombre} te saluda zarkvision, pasamos por aqui para recordarte el abono de tus gafas, puedes hacerlo en efectivo, nequi o bancolombia, comentanos que metodo de pago te gustaria usar?`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
}